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

// Default high-end settings
const defaultHighEndResolution = resolutions[2]; // 4K
const defaultHighEndFrameRate = 60;

// Default low-end settings
const defaultLowEndResolution = resolutions[4]; // 1080p
const defaultLowEndFrameRate = 30;

// Helper function to check MediaRecorder support
const isMediaRecorderSupported = () => typeof MediaRecorder !== 'undefined';

// --- Helper Function to detect low-end device ---
const isLowEndDevice = (): boolean => {
  if (typeof navigator === 'undefined') return false; // Cannot detect on server

  const cores = navigator.hardwareConcurrency;
  // const memory = (navigator as any).deviceMemory; // deviceMemory is less reliable/standardized

  // Simple heuristic: Consider device low-end if it has 4 or fewer logical cores
  // Adjust this threshold based on testing and desired performance trade-off
  if (cores && cores <= 4) {
    console.log(`Detected low-end device (Cores: ${cores})`);
    return true;
  }

  // console.log(`Detected standard/high-end device (Cores: ${cores ?? 'N/A'})`);
  return false;
};
// --- End Helper Function ---

export default function Home() {
  const [isClient, setIsClient] = useState(false);
  const [recording, setRecording] = useState(false);
  const [videoURL, setVideoURL] = useState<string | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);
  const [hasDisplayMediaPermission, setHasDisplayMediaPermission] = useState<boolean | null>(null);
  const streamRef = useRef<MediaStream | null>(null); // Ref to store the stream

  // Set initial state based on device detection (will be updated in useEffect)
  const [selectedResolution, setSelectedResolution] = useState(defaultHighEndResolution);
  const [frameRate, setFrameRate] = useState(defaultHighEndFrameRate);

  const [isCheckingPermission, setIsCheckingPermission] = useState(true); // Track initial check

  useEffect(() => {
    setIsClient(true); // Indicate component has mounted on the client

    // --- Device Performance Check and Default Setting ---
    const lowEnd = isLowEndDevice();
    if (lowEnd) {
      setSelectedResolution(defaultLowEndResolution);
      setFrameRate(defaultLowEndFrameRate);
    } else {
      setSelectedResolution(defaultHighEndResolution);
      setFrameRate(defaultHighEndFrameRate);
    }
    // --- End Device Check ---


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
  }, [videoURL]); // Re-added videoURL dependency for cleanup

  const startRecording = async () => {
    if (!isClient || !isMediaRecorderSupported()) {
      sonnerToast.error("Recording Error", {
        description: "Screen recording is not supported in this browser or environment.",
        duration: 5000,
      });
      return;
    }

    setVideoURL(null); // Clear previous recording if any
    recordedChunks.current = []; // Clear existing chunks

    try {
      // Request permission just before starting if needed
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: selectedResolution.width, max: selectedResolution.width },
          height: { ideal: selectedResolution.height, max: selectedResolution.height },
          frameRate: { ideal: frameRate, max: frameRate },
          // cursor: 'always' // Optional: Show cursor
        },
        audio: true, // Request audio
      });

      streamRef.current = stream; // Store the stream

      // Handle inactive stream (e.g., user stops sharing from browser UI)
      stream.addEventListener('inactive', stopRecording);

      const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=h264,opus', 'video/webm;codecs=vp8,opus', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/webm'].find(
        (type) => MediaRecorder.isTypeSupported(type)
      ) || 'video/webm';
      console.log("Using MIME type:", mimeType);

      mediaRecorder.current = new MediaRecorder(stream, {
        mimeType: mimeType,
        videoBitsPerSecond: selectedResolution.width * selectedResolution.height * frameRate * 0.1, // Rough estimate
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

        const blob = new Blob(recordedChunks.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setVideoURL(url);
        recordedChunks.current = [];
        stream.removeEventListener('inactive', stopRecording); // Clean up listener
        streamRef.current = null; // Clear stream ref
        setRecording(false);
      };

      mediaRecorder.current.onerror = (event: Event) => {
        console.error("MediaRecorder error:", event);
        // Try to access specific error if possible (DOMError in some browsers)
        let errorMessage = "An error occurred during recording.";
        if (event instanceof ErrorEvent && event.error) {
             errorMessage = `Recording error: ${event.error.name} - ${event.error.message}`;
        } else if ((event as any).error) { // Fallback for older event structures
             const err = (event as any).error;
             errorMessage = `Recording error: ${err.name || 'Unknown'} - ${err.message || 'No message'}`;
        }

        sonnerToast.error("Recording Error", {
          description: errorMessage,
          duration: 5000,
        });
        stopRecording(); // Attempt to stop gracefully
      };

      mediaRecorder.current.start(100); // Collect data frequently
      setRecording(true);
      setHasDisplayMediaPermission(true); // Assume permission granted if getDisplayMedia succeeded

    } catch (error: any) {
      console.error("Error starting recording stream:", error);
      setHasDisplayMediaPermission(false); // Permission likely denied or failed
      if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
        sonnerToast.error("Permission Required", {
          description: "Can't start recording. Please grant screen recording permissions.",
          duration: 5000,
        });
      } else if (error.message?.includes("permissions policy")) {
          sonnerToast.error("Recording Unavailable", {
              description: "Can't start recording here due to browser or website restrictions (Permissions Policy).",
              duration: 6000,
          });
      } else {
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
    if (mediaRecorder.current && mediaRecorder.current.state === "recording") {
      mediaRecorder.current.requestData(); // Request final data
      mediaRecorder.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current.removeEventListener('inactive', stopRecording); // Clean up listener
    }
    streamRef.current = null; // Clear stream ref
    // onstop handler will set recording to false
  };

  // Render loading state during SSR and initial client mount before hydration check completes
  if (!isClient) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background text-foreground">
        <h1 className="text-3xl font-bold mb-6 text-primary">Resolution Recorder</h1>
        <Card className="w-full max-w-md p-6 shadow-lg rounded-lg border border-border">
          <CardHeader className="p-0 pb-4">
            <CardTitle className="text-xl text-center">Recording Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-0">
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
     // Let the startRecording function handle the permission request/check on click
     if (recording) return { disabled: false, text: 'Stop Recording' };
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
                if (res) setSelectedResolution(res);
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
              onValueChange={(value) => setFrameRate(parseInt(value))}
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
            className="rounded-md shadow-md w-full aspect-video border border-border"
          />
          <a
            href={videoURL}
            download={`recording-${selectedResolution.label.split(' ')[0]}-${frameRate}fps.${mimeTypeToExtension(mediaRecorder.current?.mimeType)}`}
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
