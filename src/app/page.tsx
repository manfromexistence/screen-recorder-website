"use client";

import { Button } from "@/components/ui/button";
import { useState, useRef, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Toaster, toast as sonnerToast } from 'sonner'; // Use sonner directly for toasts
import { cn } from "@/lib/utils";

// Define available resolutions
const resolutions = [
  { label: "8K (7680x4320)", width: 7680, height: 4320 },
  { label: "5K (5120x2880)", width: 5120, height: 2880 },
  { label: "4K (3840x2160)", width: 3840, height: 2160 },
  { label: "1440p (2560x1440)", width: 2560, height: 1440 },
  { label: "1080p (1920x1080)", width: 1920, height: 1080 },
  { label: "720p (1280x720)", width: 1280, height: 720 },
  { label: "480p (854x480)", width: 854, height: 480 },
  { label: "240p (426x240)", width: 426, height: 240 },
];

const availableFrameRates = [30, 60];

// Helper function to check MediaRecorder support
const isMediaRecorderSupported = () => typeof MediaRecorder !== 'undefined';

export default function Home() {
  const [isClient, setIsClient] = useState(false);
  const [recording, setRecording] = useState(false);
  const [videoURL, setVideoURL] = useState<string | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);
  // Initialize permission assuming we need to request it or check it.
  const [hasDisplayMediaPermission, setHasDisplayMediaPermission] = useState<boolean | null>(null);
  const streamRef = useRef<MediaStream | null>(null); // Ref to store the stream
  const [selectedResolution, setSelectedResolution] = useState(resolutions[2]); // Default to 4K
  const [frameRate, setFrameRate] = useState(60);
  const [isCheckingPermission, setIsCheckingPermission] = useState(true); // Track initial check

  useEffect(() => {
    setIsClient(true); // Indicate component has mounted on the client

    // Function to check display media permission status without prompting
    const checkDisplayMediaPermission = async () => {
      let isMounted = true;
      setIsCheckingPermission(true);

      if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
        if (navigator.permissions && navigator.permissions.query) {
            try {
              // Try querying the permission status first (might not be supported everywhere)
              const permissionStatus = await navigator.permissions.query({ name: 'display-capture' as PermissionName });

              if (isMounted) {
                  if (permissionStatus.state === 'granted') {
                    setHasDisplayMediaPermission(true);
                  } else {
                    // Permission is denied or prompt required
                    setHasDisplayMediaPermission(false);
                  }
              }
              permissionStatus.onchange = () => {
                if (isMounted) {
                   setHasDisplayMediaPermission(permissionStatus.state === 'granted');
                }
              };

            } catch (queryError) {
               console.warn("Permissions API query for display-capture failed:", queryError);
                // Fallback: Assume permission needs to be requested.
               if (isMounted) {
                 setHasDisplayMediaPermission(false);
               }
            }
        } else {
             console.warn("Permissions API not supported, assuming permission needs to be requested.");
             // Permissions API not supported, assume we need to ask
             if (isMounted) {
               setHasDisplayMediaPermission(false);
             }
        }
      } else {
        console.warn("Screen Capture API not fully supported in this browser.");
        if (isMounted) {
          setHasDisplayMediaPermission(false);
        }
        sonnerToast.error("Unsupported Browser", {
            description: "Screen recording features are not available in your current browser.",
            duration: 5000,
        });
      }
      if (isMounted) {
        setIsCheckingPermission(false); // Finished check
      }

       return () => {
         isMounted = false;
       };
    };

    checkDisplayMediaPermission();

    // Cleanup function
    return () => {
      // Stop stream if component unmounts while recording
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      // Revoke object URL to prevent memory leaks
      if (videoURL) {
        URL.revokeObjectURL(videoURL);
      }
    };
  }, []); // Only run on mount

  const startRecording = async () => {
    if (!isClient || !isMediaRecorderSupported()) {
      sonnerToast.error("Recording Error", {
        description: "Screen recording is not supported in this browser or environment.",
        duration: 5000,
      });
      return;
    }

    // Re-check or request permission just before starting
     if (hasDisplayMediaPermission === false) {
       try {
         // Explicitly request permission now
         await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
         setHasDisplayMediaPermission(true); // Permission granted
       } catch (error: any) {
          console.error("Error getting display media permission:", error);
          setHasDisplayMediaPermission(false); // Update state if denied
          if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
             sonnerToast.error("Permission Required", {
               description: "Can't start recording. Please grant screen recording permissions.",
               duration: 5000,
             });
          } else if (error.message.includes("permissions policy")) {
             sonnerToast.error("Permission Policy Issue", {
                description: "Can't start recording here due to browser or website restrictions.",
                duration: 5000,
            });
          }
          else {
             sonnerToast.error("Recording Failed", {
               description: `Could not get screen access: ${error.message}`,
               duration: 5000,
             });
          }
         return; // Stop if permission wasn't granted
       }
     }


    setVideoURL(null); // Clear previous recording if any
    recordedChunks.current = []; // Clear existing chunks

    try {
       // If permission was already granted or just granted, proceed to get the stream with desired settings
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: selectedResolution.width, max: selectedResolution.width }, // Use ideal and max
          height: { ideal: selectedResolution.height, max: selectedResolution.height },
          frameRate: { ideal: frameRate, max: frameRate }, // Use ideal and max for frame rate
          // cursor: 'always' // Optional: Show cursor in recording
        },
        audio: true, // Request audio
      });

      streamRef.current = stream; // Store the stream

      // Handle inactive stream (e.g., user stops sharing from browser UI)
      stream.addEventListener('inactive', stopRecording);


      const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=h264,opus', 'video/webm;codecs=vp8,opus', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/webm'].find(
           (type) => MediaRecorder.isTypeSupported(type)
      ) || 'video/webm';
       console.log("Using MIME type:", mimeType);


      mediaRecorder.current = new MediaRecorder(stream, {
        mimeType: mimeType,
        // Adjust bitrates based on resolution and frame rate. Higher needs more bitrate.
        // These are general starting points, may need more tuning.
        videoBitsPerSecond: selectedResolution.width * selectedResolution.height * frameRate * 0.1, // Rough calculation
        audioBitsPerSecond: 128000, // 128 kbps for audio
      });


      mediaRecorder.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunks.current.push(event.data);
        }
      };

      mediaRecorder.current.onstop = () => {
        if (recordedChunks.current.length === 0) {
          console.warn("No data recorded.");
           setRecording(false);
          stream.removeEventListener('inactive', stopRecording); // Clean up listener
          streamRef.current = null; // Clear stream ref
          return;
        }

        const blob = new Blob(recordedChunks.current, {
          type: mimeType,
        });
        const url = URL.createObjectURL(blob);
        setVideoURL(url);
        recordedChunks.current = [];
        stream.removeEventListener('inactive', stopRecording); // Clean up listener
        streamRef.current = null; // Clear stream ref
        setRecording(false);
      };

       mediaRecorder.current.onerror = (event) => {
        console.error("MediaRecorder error:", event);
         // Use a more specific error type if possible, otherwise default to 'error'
        let errorMessage = "An error occurred during recording.";
        // TODO: Inspect the event further for specific error details if available
        // if (event.error && event.error.name) { errorMessage += ` Name: ${event.error.name}`; }
        // if (event.error && event.error.message) { errorMessage += ` Message: ${event.error.message}`; }

        sonnerToast.error("Recording Error", {
            description: errorMessage,
            duration: 5000,
        });
        stopRecording(); // Attempt to stop gracefully
      };

      mediaRecorder.current.start(100); // Collect data more frequently (e.g., every 100ms) for potentially better sync
      setRecording(true);

    } catch (error: any) {
      console.error("Error starting recording stream:", error);
      // Permission error might have been caught earlier, but handle other potential errors here
      if (!`${error.message}`.includes("Permission denied")) { // Avoid duplicate permission messages
           sonnerToast.error("Recording Failed", {
            description: `Could not start recording: ${error.message}`,
            duration: 5000,
          });
      }
       // Ensure recording state is false if start failed
       setRecording(false);
       if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
    }
  };

 const stopRecording = () => {
    // Check both mediaRecorder and stream
    if (mediaRecorder.current && mediaRecorder.current.state === "recording") {
      mediaRecorder.current.requestData(); // Request any remaining data before stopping
      mediaRecorder.current.stop();
    }
    // Also stop tracks directly, especially if recorder failed to start but stream was acquired
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
       streamRef.current.removeEventListener('inactive', stopRecording); // Clean up listener
    }

    streamRef.current = null; // Clear stream ref
    // MediaRecorder.onstop will set recording to false
  };

  // Prevent rendering on server or before client mount to avoid hydration errors
  if (!isClient) {
    // Render a basic loading state or null during SSR and initial client mount
    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background text-foreground">
             <h1 className="text-3xl font-bold mb-6 text-primary">Resolution Recorder</h1>
             <Card className="w-full max-w-md p-6 shadow-lg rounded-lg border border-border">
                 <CardHeader className="p-0 pb-4">
                     <CardTitle className="text-xl text-center">Recording Settings</CardTitle>
                 </CardHeader>
                 <CardContent className="space-y-4 p-0">
                    {/* Simplified loading state */}
                    <div className="text-center text-muted-foreground">Loading settings...</div>
                 </CardContent>
                 <CardFooter className="flex justify-center pt-6 p-0">
                     <Button className="w-full" disabled>Loading...</Button>
                 </CardFooter>
             </Card>
        </div>
    );
  }

  const getButtonState = () => {
     if (isCheckingPermission) return { disabled: true, text: 'Checking Permissions...' };
     if (recording) return { disabled: false, text: 'Stop Recording' };
     // Button should be enabled even if permission is not granted yet, clicking it will trigger the request.
     return { disabled: false, text: 'Start Recording' };
  };

  const buttonState = getButtonState();


  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background text-foreground">
      <Toaster richColors position="top-center" />
      <h1 className="text-3xl font-bold mb-6 text-primary">Resolution Recorder</h1>

       <Card className="w-full max-w-md p-6 shadow-lg rounded-lg border border-border">
            <CardHeader className="p-0 pb-4">
                <CardTitle className="text-xl text-center">Recording Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-0">
                 <div className="flex flex-col space-y-2">
                    <Label htmlFor="resolution" className="text-sm font-medium">Resolution</Label>
                    <Select
                      value={selectedResolution.label}
                      onValueChange={(value) => {
                        const res = resolutions.find((r) => r.label === value);
                        if (res) {
                          setSelectedResolution(res);
                        }
                      }}
                      disabled={recording}
                    >
                      <SelectTrigger id="resolution" className="w-full">
                        <SelectValue placeholder="Select resolution..." />
                      </SelectTrigger>
                      <SelectContent>
                        {resolutions.map((resolution) => (
                          <SelectItem key={resolution.label} value={resolution.label}>
                            {resolution.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                   <div className="flex flex-col space-y-2">
                    <Label htmlFor="frameRate" className="text-sm font-medium">Frame Rate</Label>
                    <Select
                        value={frameRate.toString()}
                         onValueChange={(value) => {
                           setFrameRate(parseInt(value));
                         }}
                         disabled={recording}
                        >
                          <SelectTrigger id="frameRate" className="w-full">
                            <SelectValue placeholder="Select frame rate..." />
                          </SelectTrigger>
                          <SelectContent>
                            {availableFrameRates.map((rate) => (
                              <SelectItem key={rate} value={rate.toString()}>
                                {rate} fps
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">Higher frame rates result in smoother video but require more resources.</p>
                    </div>
            </CardContent>
             <CardFooter className="flex justify-center pt-6 p-0">
                 <Button
                   onClick={recording ? stopRecording : startRecording}
                   className={cn("w-full transition-colors duration-200 ease-in-out",
                      recording ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-primary text-primary-foreground hover:bg-primary/90"
                   )}
                   disabled={buttonState.disabled}
                   aria-label={recording ? "Stop screen recording" : "Start screen recording"}
                 >
                    {buttonState.text}
                 </Button>
             </CardFooter>
           </Card>


      {videoURL && (
        <div className="mt-8 w-full max-w-2xl">
           <h2 className="text-xl font-semibold mb-3 text-center">Recording Preview</h2>
          <video
            src={videoURL}
            controls
            // Removed fixed width/height, let it be responsive
            className="rounded-md shadow-md w-full aspect-video border border-border"
            />
          <a
            href={videoURL}
            download={`recording-${selectedResolution.label.split(' ')[0]}-${frameRate}fps.${mimeTypeToExtension(mediaRecorder.current?.mimeType)}`} // More descriptive filename with correct extension
            className="block mt-4 text-center text-accent hover:underline font-medium"
          >
            Download Video ({selectedResolution.label.split(' ')[0]}, {frameRate}fps)
          </a>
        </div>
      )}
    </div>
  );
}

// Helper to get appropriate file extension based on MIME type
function mimeTypeToExtension(mimeType?: string | null): string {
    if (!mimeType) return 'webm'; // Default
    if (mimeType.includes('mp4')) return 'mp4';
    if (mimeType.includes('webm')) return 'webm';
    // Add other mappings as needed
    return 'webm'; // Fallback
}
