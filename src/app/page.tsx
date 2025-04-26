"use client";

import { Button } from "@/components/ui/button";
import { useState, useRef, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Toaster, toast as sonnerToast } from 'sonner';
import { cn } from "@/lib/utils";
import { uploadToGoFile } from "@/services/gofile"; // Import the GoFile service
import { Loader2 } from "lucide-react"; // Import Loader icon

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

// Helper Function to detect low-end device
const isLowEndDevice = (): boolean => {
  if (typeof navigator === 'undefined') return false;

  const cores = navigator.hardwareConcurrency;
  if (cores && cores <= 4) {
    console.log(`Detected low-end device (Cores: ${cores})`);
    return true;
  }
  return false;
};

// GoFile Account Token (Consider moving to .env.local for security)
const ACCOUNT_TOKEN = "L8i5S6dbkfKkwpOip6omaExfCuVKY27b";

export default function Home() {
  const [isClient, setIsClient] = useState(false);
  const [recording, setRecording] = useState(false);
  const [videoURL, setVideoURL] = useState<string | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);
  const [hasDisplayMediaPermission, setHasDisplayMediaPermission] = useState<boolean | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [mimeType, setMimeType] = useState<string>('video/webm'); // Store mime type

  // State for GoFile upload
  const [isUploading, setIsUploading] = useState(false);
  const [gofileLink, setGofileLink] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Set initial state based on device detection
  const getInitialResolution = () => isLowEndDevice() ? defaultLowEndResolution : defaultHighEndResolution;
  const getInitialFrameRate = () => isLowEndDevice() ? defaultLowEndFrameRate : defaultHighEndFrameRate;

  const [selectedResolution, setSelectedResolution] = useState(getInitialResolution);
  const [frameRate, setFrameRate] = useState(getInitialFrameRate);

  const [isCheckingPermission, setIsCheckingPermission] = useState(true);

  useEffect(() => {
    setIsClient(true);

    // Re-evaluate settings on client mount after hydration
    setSelectedResolution(getInitialResolution());
    setFrameRate(getInitialFrameRate());

    // Function to check display media permission status without prompting
    const checkDisplayMediaPermission = async () => {
      let isMounted = true;
      setIsCheckingPermission(true);

      if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
        if (navigator.permissions && navigator.permissions.query) {
            try {
              const permissionStatus = await navigator.permissions.query({ name: 'display-capture' as PermissionName });

              if (isMounted) {
                  setHasDisplayMediaPermission(permissionStatus.state === 'granted');
              }
              permissionStatus.onchange = () => {
                if (isMounted) {
                   setHasDisplayMediaPermission(permissionStatus.state === 'granted');
                }
              };

            } catch (queryError) {
               console.warn("Permissions API query for display-capture failed:", queryError);
               if (isMounted) {
                 setHasDisplayMediaPermission(false);
               }
            }
        } else {
             console.warn("Permissions API not supported, assuming permission needs to be requested.");
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
        setIsCheckingPermission(false);
      }

       return () => {
         isMounted = false;
       };
    };

    checkDisplayMediaPermission();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (videoURL) {
        URL.revokeObjectURL(videoURL);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  const startRecording = async () => {
    if (!isClient || !isMediaRecorderSupported()) {
      sonnerToast.error("Recording Error", {
        description: "Screen recording is not supported in this browser or environment.",
        duration: 5000,
      });
      return;
    }

    setVideoURL(null);
    setGofileLink(null); // Clear previous GoFile link
    setUploadError(null); // Clear previous upload error
    recordedChunks.current = [];

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: selectedResolution.width, max: selectedResolution.width },
          height: { ideal: selectedResolution.height, max: selectedResolution.height },
          frameRate: { ideal: frameRate, max: frameRate },
        },
        audio: true,
      });

      streamRef.current = stream;
      stream.addEventListener('inactive', stopRecording);

      const chosenMimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=h264,opus', 'video/webm;codecs=vp8,opus', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/webm'].find(
        (type) => MediaRecorder.isTypeSupported(type)
      ) || 'video/webm';
      setMimeType(chosenMimeType); // Store the chosen mime type
      console.log("Using MIME type:", chosenMimeType);

      mediaRecorder.current = new MediaRecorder(stream, {
        mimeType: chosenMimeType,
        videoBitsPerSecond: selectedResolution.width * selectedResolution.height * frameRate * 0.07, // Adjusted bitrate factor
        audioBitsPerSecond: 128000,
      });

      mediaRecorder.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunks.current.push(event.data);
        }
      };

      mediaRecorder.current.onstop = async () => {
        if (recordedChunks.current.length === 0) {
          console.warn("No data recorded.");
          setRecording(false);
          stream.removeEventListener('inactive', stopRecording);
          streamRef.current = null;
          return;
        }

        const blob = new Blob(recordedChunks.current, { type: chosenMimeType });
        const url = URL.createObjectURL(blob);
        setVideoURL(url);
        recordedChunks.current = [];
        stream.removeEventListener('inactive', stopRecording);
        streamRef.current = null;
        setRecording(false);

        // --- Start GoFile Upload ---
        setIsUploading(true);
        setUploadError(null);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `recording-${selectedResolution.label.split(' ')[0]}-${frameRate}fps-${timestamp}.${mimeTypeToExtension(chosenMimeType)}`;

        try {
            sonnerToast.info("Uploading to GoFile...", { id: 'gofile-upload' });
            const downloadPage = await uploadToGoFile(blob, filename, ACCOUNT_TOKEN);
            if (downloadPage) {
                setGofileLink(downloadPage);
                sonnerToast.success("Upload successful!", { description: "Video uploaded to GoFile.", id: 'gofile-upload', duration: 4000 });
            } else {
                throw new Error("GoFile API did not return a download page.");
            }
        } catch (error: any) {
            console.error("GoFile upload failed:", error);
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred during upload.";
            setUploadError(`GoFile upload failed: ${errorMessage}`);
            sonnerToast.error("GoFile Upload Failed", { description: errorMessage, id: 'gofile-upload', duration: 6000 });
        } finally {
            setIsUploading(false);
        }
        // --- End GoFile Upload ---
      };

      mediaRecorder.current.onerror = (event: Event) => {
        console.error("MediaRecorder error:", event);
        let errorMessage = "An error occurred during recording.";
        // Extract specific error details if possible
        try {
            if ((event as any).error) {
                const err = (event as any).error;
                errorMessage = `Recording error: ${err.name || 'Unknown'} - ${err.message || 'No message'}`;
            }
        } catch (e) { /* Ignore extraction error */ }

        sonnerToast.error("Recording Error", {
          description: errorMessage,
          duration: 5000,
        });
        stopRecording();
      };

      mediaRecorder.current.start(1000); // Collect data every second
      setRecording(true);
      setHasDisplayMediaPermission(true);

    } catch (error: any) {
      console.error("Error starting recording stream:", error);
      setHasDisplayMediaPermission(false);
      if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
        sonnerToast.error("Permission Required", {
          description: "Can't start recording. Please grant screen recording permissions.",
          duration: 5000,
        });
      } else if (error.message?.includes("permissions policy") || error.name === 'NotSupportedError') {
          sonnerToast.error("Recording Unavailable", {
              description: "Can't start recording here due to browser or website restrictions (Permissions Policy or unsupported operation).",
              duration: 6000,
          });
      } else {
        sonnerToast.error("Recording Failed", {
          description: `Could not start recording: ${error.message}`,
          duration: 5000,
        });
      }
      setRecording(false);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && mediaRecorder.current.state === "recording") {
      mediaRecorder.current.stop(); // onstop handler will process chunks
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current.removeEventListener('inactive', stopRecording);
    }
    streamRef.current = null;
    // onstop handler will set recording to false and handle upload
  };

  // Suppress hydration warning for initial client-side check
  useEffect(() => {
      setIsClient(true);
  }, []);


  // Render loading state during SSR or initial client check
  if (!isClient || isCheckingPermission) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background text-foreground">
        <h1 className="text-3xl font-bold mb-6 text-primary">Resolution Recorder</h1>
        <Card className="w-full max-w-md p-6 shadow-lg rounded-lg border border-border">
          <CardHeader className="p-0 pb-4">
            <CardTitle className="text-xl text-center">Recording Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-0">
            <div className="text-center text-muted-foreground">Loading...</div>
          </CardContent>
          <CardFooter className="flex justify-center pt-6 p-0">
            <Button className="w-full" disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading...
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

   const getButtonState = () => {
     // Don't disable just for permission check, let startRecording handle it
     if (recording) return { disabled: false, text: 'Stop Recording' };
     if (isUploading) return { disabled: true, text: 'Uploading...' };
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
              disabled={recording || isUploading}
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
              disabled={recording || isUploading}
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
            {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {buttonState.text}
          </Button>
        </CardFooter>
      </Card>

      {/* Display GoFile link or local download based on availability */}
      {gofileLink && (
        <div className="mt-8 w-full max-w-2xl text-center">
           <h2 className="text-xl font-semibold mb-3">Upload Complete</h2>
           <p className="mb-2">Your video has been uploaded:</p>
           <a
             href={gofileLink}
             target="_blank"
             rel="noopener noreferrer"
             className="block text-accent hover:underline font-medium break-all"
           >
             {gofileLink}
           </a>
           {/* Keep local download as a fallback */}
           {videoURL && (
             <a
                href={videoURL}
                download={`recording-${selectedResolution.label.split(' ')[0]}-${frameRate}fps.${mimeTypeToExtension(mimeType)}`}
                className="block mt-4 text-sm text-muted-foreground hover:underline"
             >
               Download Locally (Fallback)
             </a>
           )}
        </div>
      )}

      {/* Show local preview/download only if GoFile upload hasn't happened or failed */}
      {!gofileLink && videoURL && (
        <div className="mt-8 w-full max-w-2xl">
          <h2 className="text-xl font-semibold mb-3 text-center">Recording Preview</h2>
          <video
            src={videoURL}
            controls
            className="rounded-md shadow-md w-full aspect-video border border-border"
          />
          <a
            href={videoURL}
            download={`recording-${selectedResolution.label.split(' ')[0]}-${frameRate}fps.${mimeTypeToExtension(mimeType)}`}
            className="block mt-4 text-center text-accent hover:underline font-medium"
          >
            Download Locally ({selectedResolution.label.split(' ')[0]}, {frameRate}fps)
          </a>
        </div>
      )}

      {/* Display upload error if any */}
       {uploadError && (
          <div className="mt-4 w-full max-w-md text-center p-3 bg-destructive/10 border border-destructive text-destructive rounded-md">
             <p className="font-medium">Upload Failed</p>
             <p className="text-sm">{uploadError}</p>
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
    return 'webm'; // Fallback
}
