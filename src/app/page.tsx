
"use client";

import { Button, buttonVariants } from "@/components/ui/button"; // Correctly import buttonVariants
import { useState, useRef, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog"; // Import Dialog components
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"; // Import Tabs components
import { ScrollArea } from "@/components/ui/scroll-area"; // Import ScrollArea
import { toast as sonnerToast } from 'sonner'; // Import Sonner Toaster directly
import { cn } from "@/lib/utils";
import { uploadToGoFile } from "@/services/gofile"; // Import the GoFile service
import { Loader2, Copy, Trash2, Video, PlayCircle, Image as ImageIcon, Music, Code } from "lucide-react"; // Import Loader, Copy, Trash, Video, PlayCircle, Image, Music, Code icons
import { getCookie, setCookie, deleteCookie } from 'cookies-next'; // Use cookies-next for easier cookie management

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
  // Consider devices with 4 or fewer cores or limited memory as potentially low-end
  const cores = navigator.hardwareConcurrency;
  const memory = (navigator as any).deviceMemory; // Note: deviceMemory is not universally supported

  // Check for undefined or low values
  const lowCores = cores !== undefined && cores <= 4;
  const lowMemory = memory !== undefined && memory <= 4;

  if (lowCores || lowMemory) {
    console.log(`Detected potential low-end device (Cores: ${cores ?? 'N/A'}, Memory: ${memory ?? 'N/A'}GB)`);
    return true;
  }
  return false;
};


// GoFile Account Token - Now read from environment variable in gofile.ts
// const ACCOUNT_TOKEN = process.env.NEXT_PUBLIC_GOFILE_ACCOUNT_TOKEN; // Client-side access (less secure)
// Recommended: Use the token server-side in API routes/services if possible.
// If client-side upload is necessary, ensure NEXT_PUBLIC_ prefix.
// We'll keep the client-side upload logic for now, but acknowledge the token exposure risk.
const ACCOUNT_TOKEN = process.env.NEXT_PUBLIC_GOFILE_ACCOUNT_TOKEN || "L8i5S6dbkfKkwpOip6omaExfCuVKY27b"; // Fallback for testing if env var not set

const GOFILE_LINKS_COOKIE_NAME = 'gofileLinks';

interface GoFileLinkData {
    url: string; // The GoFile download page URL (e.g., https://gofile.io/d/xxxxx)
    timestamp: number;
    filename: string;
    // Removed mediaUrl, mediaType, mime as we're fetching HTML now
}

// Interface for API error response
interface ErrorResponse {
    error: string;
}

// Interface for HTML preview data from API
interface HtmlPreviewData {
    htmlContent: string;
}

export default function Home() {
  const [isClient, setIsClient] = useState(false);
  const [recording, setRecording] = useState(false);
  const [videoURL, setVideoURL] = useState<string | null>(null); // Local blob URL for preview after recording stops
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);
  const [hasDisplayMediaPermission, setHasDisplayMediaPermission] = useState<boolean | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [mimeType, setMimeType] = useState<string>('video/webm'); // Store mime type

  // State for GoFile upload
  const [isUploading, setIsUploading] = useState(false);
  const [gofileLink, setGofileLink] = useState<string | null>(null); // Stores the GoFile PAGE URL after upload
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [recordedLinks, setRecordedLinks] = useState<GoFileLinkData[]>([]); // State for stored links from cookie

  // State to hold initial settings determined after client mount
  const [initialResolution, setInitialResolution] = useState<typeof resolutions[0] | null>(null);
  const [initialFrameRate, setInitialFrameRate] = useState<number | null>(null);

  const [selectedResolution, setSelectedResolution] = useState<typeof resolutions[0] | null>(null);
  const [frameRate, setFrameRate] = useState<number | null>(null);


  const [isCheckingPermission, setIsCheckingPermission] = useState(true);

  // State for Preview Modal
  const [previewHtml, setPreviewHtml] = useState<string | null>(null); // Holds fetched HTML content from API
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [loadingPreviewUrl, setLoadingPreviewUrl] = useState<string | null>(null); // Track which GoFile page link is loading
  const [previewError, setPreviewError] = useState<string | null>(null); // Error specific to preview loading


  // --- Cookie Helper Functions ---
   const loadLinksFromCookie = (): GoFileLinkData[] => {
       const cookieValue = getCookie(GOFILE_LINKS_COOKIE_NAME);
       if (typeof cookieValue === 'string') {
           try {
               const parsedLinks = JSON.parse(cookieValue);
               // Basic validation
               if (Array.isArray(parsedLinks) && parsedLinks.every(link => typeof link === 'object' && link.url && link.timestamp && link.filename)) {
                    // No need to map mediaType/mime anymore
                    return parsedLinks;
               }
           } catch (error) {
               console.error("Error parsing gofileLinks cookie:", error);
               // If parsing fails, delete the corrupted cookie
               deleteCookie(GOFILE_LINKS_COOKIE_NAME);
           }
       }
       return [];
   };

   const saveLinksToCookie = (links: GoFileLinkData[]) => {
       try {
           const cookieValue = JSON.stringify(links);
           setCookie(GOFILE_LINKS_COOKIE_NAME, cookieValue, {
               maxAge: 60 * 60 * 24 * 365, // 1 year expiry
               path: '/',
               sameSite: 'lax',
           });
       } catch (error) {
           console.error("Error saving gofileLinks cookie:", error);
           sonnerToast.error("Cookie Error", { description: "Could not save recording history." });
       }
   };

   const addLinkToCookie = (newLink: GoFileLinkData) => {
       const currentLinks = loadLinksFromCookie();
       // Prevent duplicates (optional, based on URL)
       if (!currentLinks.some(link => link.url === newLink.url)) {
            // No extra properties needed
            const updatedLinks = [newLink, ...currentLinks].slice(0, 50); // Keep latest 50 links
            setRecordedLinks(updatedLinks); // Update state immediately
            saveLinksToCookie(updatedLinks);
       }
   };

    const deleteLinkFromCookie = (urlToDelete: string) => {
        const currentLinks = loadLinksFromCookie();
        const updatedLinks = currentLinks.filter(link => link.url !== urlToDelete);
        setRecordedLinks(updatedLinks); // Update state
        saveLinksToCookie(updatedLinks); // Update cookie
        sonnerToast.info("Recording deleted from history.");
    };

   // Function to update a specific link in the cookie - No longer needed for media info


  // --- Effects ---
  useEffect(() => {
      // This effect runs only once on the client after hydration
      setIsClient(true);

      // Determine initial settings based on device capabilities on the client
      const initialRes = isLowEndDevice() ? defaultLowEndResolution : defaultHighEndResolution;
      const initialFps = isLowEndDevice() ? defaultLowEndFrameRate : defaultHighEndFrameRate;
      setInitialResolution(initialRes);
      setInitialFrameRate(initialFps);
      setSelectedResolution(initialRes); // Set the current selection
      setFrameRate(initialFps); // Set the current selection

      // Load links from cookie
      setRecordedLinks(loadLinksFromCookie());

      // Function to check display media permission status without prompting
      const checkDisplayMediaPermission = async () => {
          let isMounted = true;
          setIsCheckingPermission(true);
          let permissionGranted: boolean | null = null; // Track permission state locally

          if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
              if (navigator.permissions && navigator.permissions.query) {
                  try {
                      // Query for display-capture permission status
                      const permissionStatus = await navigator.permissions.query({ name: 'display-capture' as PermissionName });

                      if (isMounted) {
                           console.log("Initial display-capture permission state:", permissionStatus.state);
                           permissionGranted = permissionStatus.state === 'granted';
                           setHasDisplayMediaPermission(permissionGranted);

                           // Show informative toast based on state
                            if (permissionStatus.state === 'denied') {
                                sonnerToast.error("Screen Recording Denied", {
                                    description: "Permission was previously denied. Please enable it in your browser settings.",
                                    duration: 7000,
                                });
                            } else if (permissionStatus.state === 'prompt') {
                                // Don't show a toast here, let the user initiate the prompt by clicking the button
                                console.log("Screen recording permission requires prompt.");
                            }
                      }

                      // Listen for changes in permission status
                      permissionStatus.onchange = () => {
                           if (isMounted) {
                               console.log("Display-capture permission state changed to:", permissionStatus.state);
                               permissionGranted = permissionStatus.state === 'granted';
                               setHasDisplayMediaPermission(permissionGranted);
                               // If permission becomes denied, show toast
                                if (permissionStatus.state === 'denied') {
                                    sonnerToast.error("Screen Recording Denied", {
                                       description: "Permission was denied. Please enable it in your browser settings.",
                                       duration: 7000,
                                    });
                                }
                           }
                      };

                  } catch (queryError: any) {
                      console.warn("Permissions API query for display-capture failed:", queryError);
                      // Fallback: Assume permission needs prompting if query fails.
                      // We can't reliably check for policy errors without attempting getDisplayMedia.
                       if (isMounted) {
                            setHasDisplayMediaPermission(null); // Set to null (undetermined) instead of false
                            permissionGranted = null;
                            console.log("Assuming prompt needed as permission query failed.");
                       }
                  }
              } else {
                  console.warn("Permissions API not fully supported, assuming permission needs to be requested.");
                   if (isMounted) {
                      setHasDisplayMediaPermission(null); // Assume undetermined
                      permissionGranted = null;
                  }
              }

          } else {
              console.warn("Screen Capture API not fully supported in this browser.");
              if (isMounted) {
                  setHasDisplayMediaPermission(false); // API not supported = effectively no permission
              }
              permissionGranted = false;
              sonnerToast.error("Unsupported Browser", {
                  description: "Screen recording features are not available in your current browser.",
                  duration: 5000,
              });
          }

           if (isMounted) {
              setIsCheckingPermission(false);
              console.log("Finished checking permissions, determined granted state:", permissionGranted); // Log the final state set
          }

          return () => {
              isMounted = false;
          };
      };


      checkDisplayMediaPermission();

      return () => {
          // Cleanup stream and video URL on unmount
          if (streamRef.current) {
              streamRef.current.getTracks().forEach(track => track.stop());
          }
          if (videoURL) {
              URL.revokeObjectURL(videoURL);
          }
      };
  }, []); // Empty dependency array ensures this runs only once on mount


  const startRecording = async () => {
    // Ensure running on client and necessary APIs are available
    if (!isClient || !isMediaRecorderSupported() || !selectedResolution || frameRate === null) {
      sonnerToast.error("Setup Incomplete", {
        description: "Cannot start recording. Ensure settings are selected and the browser is supported.",
        duration: 5000,
      });
      return;
    }

    // Check if getDisplayMedia is likely disallowed by permissions policy (common in iframes/sandboxed envs)
    // This is a heuristic check before calling getDisplayMedia
    try {
       if (navigator.permissions && navigator.permissions.query) {
            const permissionStatus = await navigator.permissions.query({ name: 'display-capture' as PermissionName });
            if (permissionStatus.state === 'denied') {
                 sonnerToast.error("Permission Denied", {
                   description: "Screen recording permission was previously denied. Please enable it in your browser settings.",
                   duration: 6000,
                 });
                 return; // Stop if explicitly denied
            }
            // Check if prompt is needed
            if (permissionStatus.state === 'prompt') {
                sonnerToast.info("Permission Required", {
                   description: "Please grant screen recording permission in the browser prompt.",
                   duration: 5000,
                 });
            }
       }
    } catch (permError) {
       console.warn("Could not query display-capture permission state:", permError);
       // Proceed cautiously, getDisplayMedia will handle the actual request/error
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
          cursor: 'always' // Keep cursor visible
        },
        audio: true, // Request audio
      });

      streamRef.current = stream;
      setHasDisplayMediaPermission(true); // Permission granted implicitly by successful getDisplayMedia
      console.log("Media stream acquired successfully.");

      // Listen for the user stopping the share via browser UI
      stream.getVideoTracks()[0].onended = stopRecording;
      stream.addEventListener('inactive', stopRecording); // Fallback listener

      // Prefer VP9 or H.264 with Opus audio if available for better compatibility/quality
      const chosenMimeType = [
          'video/webm;codecs=vp9,opus',
          'video/webm;codecs=h264,opus',
          'video/mp4;codecs=avc1.42E01E,mp4a.40.2', // MP4 fallback
          'video/webm;codecs=vp8,opus',
          'video/webm' // Generic webm
        ].find(
            (type) => MediaRecorder.isTypeSupported(type)
        ) || 'video/webm'; // Default fallback

      setMimeType(chosenMimeType); // Store the chosen mime type
      console.log("Using MIME type:", chosenMimeType);

      // Calculate a reasonable bitrate based on resolution and frame rate
      // Adjusted multiplier for potentially better quality/size balance
      const videoBitrate = selectedResolution.width * selectedResolution.height * frameRate * 0.07;
      const audioBitrate = 128000; // Standard 128kbps for audio

      mediaRecorder.current = new MediaRecorder(stream, {
        mimeType: chosenMimeType,
        videoBitsPerSecond: videoBitrate,
        audioBitsPerSecond: audioBitrate,
      });

      mediaRecorder.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunks.current.push(event.data);
          // console.log(`Recorded chunk size: ${event.data.size}`);
        }
      };

      mediaRecorder.current.onstop = async () => {
        // Ensure cleanup runs only once
        if (!streamRef.current && recordedChunks.current.length === 0 && !recording) { // Added !recording check
            console.log("MediaRecorder stopped, but no stream or chunks, and not currently recording. Exiting onstop.");
            // No need to set recording to false if it wasn't recording
            return;
        }

        console.log("MediaRecorder stopped. Processing recording...");

        // Store recording state before async operations
        const wasRecording = recording;
        setRecording(false); // Update recording state immediately after stop signal

        // Clean up stream listeners and tracks if the stream still exists
        if (streamRef.current) {
            streamRef.current.removeEventListener('inactive', stopRecording);
            const videoTrack = streamRef.current.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.onended = null;
                // videoTrack.stop(); // Ensure tracks are stopped (might already be stopped)
            }
             streamRef.current.getTracks().forEach(track => track.stop()); // Ensure all tracks are stopped
            streamRef.current = null; // Indicate stream is stopped
        }


        if (recordedChunks.current.length === 0) {
          console.warn("No data recorded.");
          if (wasRecording) { // Only show warning if we were actually recording
             sonnerToast.warning("No Data Recorded", { description: "The recording was stopped before any data was captured." });
          }
          return; // Nothing to process
        }

        const blob = new Blob(recordedChunks.current, { type: chosenMimeType });
        const url = URL.createObjectURL(blob);
        setVideoURL(url); // Set local preview URL
        console.log(`Blob created: size=${blob.size}, type=${blob.type}, url=${url}`);

        // --- Start GoFile Upload ---
        setIsUploading(true);
        setUploadError(null); // Clear previous error before new upload
        const timestamp = new Date();
        const timestampStr = timestamp.toISOString().replace(/[:.]/g, '-');
        const filename = `recording-${selectedResolution.label.split(' ')[0]}-${frameRate}fps-${timestampStr}.${mimeTypeToExtension(mimeType)}`;

        try {
            sonnerToast.info("Uploading to GoFile...", { id: 'gofile-upload', description:`Filename: ${filename}` });
            const downloadPage = await uploadToGoFile(blob, filename, ACCOUNT_TOKEN); // Use token here
            // No need to check downloadPage truthiness here as uploadToGoFile throws on error
            setGofileLink(downloadPage); // Set state for immediate UI update (page URL)
            // Add the link to cookies (without media info initially)
            addLinkToCookie({
                url: downloadPage, // Store the GoFile page URL
                timestamp: timestamp.getTime(),
                filename,
            });
            sonnerToast.success("Upload successful!", { description: "Video uploaded to GoFile.", id: 'gofile-upload', duration: 4000 });
        } catch (error: any) {
            console.error("GoFile upload failed:", error);
            // Use the specific error message from uploadToGoFile or a generic one
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred during upload.";
            setUploadError(`GoFile upload failed: ${errorMessage}`); // Set error state for UI
            sonnerToast.error("GoFile Upload Failed", { description: errorMessage, id: 'gofile-upload', duration: 6000 });
        } finally {
            setIsUploading(false);
            recordedChunks.current = []; // Clear chunks after processing (upload attempt or failure)
            console.log("Cleared recorded chunks.");
        }
        // --- End GoFile Upload ---
      };

      mediaRecorder.current.onerror = (event: Event) => {
        console.error("MediaRecorder error:", event);
        let errorMessage = "An error occurred during recording.";
        // Attempt to extract more specific error details
        try {
            const mediaRecorderError = event as unknown as { error?: DOMException };
            if (mediaRecorderError.error) {
                errorMessage = `Recording error: ${mediaRecorderError.error.name} - ${mediaRecorderError.error.message}`;
            }
        } catch (e) { /* Ignore extraction error */ }

        sonnerToast.error("Recording Error", {
          description: errorMessage,
          duration: 5000,
        });
        // Attempt to stop cleanly if an error occurs
        stopRecording();
      };

      mediaRecorder.current.start(1000); // Collect data in chunks (e.g., every second)
      setRecording(true);
      sonnerToast.success("Recording Started", {
          description: `Capturing screen at ${selectedResolution.label}, ${frameRate}fps.`,
          duration: 3000,
      });


    } catch (error: any) {
      console.error("Error starting recording stream:", error);
      // Don't assume permission is false here, it might be a different error.
      // setHasDisplayMediaPermission(false);

      if (error.name === 'NotAllowedError') {
        // Distinguish between user denial and policy denial
        if (error.message?.includes('permissions policy')) {
             sonnerToast.error("Recording Unavailable", {
                description: "Can't start recording here. This might be due to browser/OS restrictions or security policies (e.g., in an iframe).",
                duration: 7000,
            });
            setHasDisplayMediaPermission(false); // Policy issue = effectively no permission
        } else {
             sonnerToast.error("Permission Required", {
                description: "Screen recording permission denied. Please grant access via the browser prompt or settings.",
                duration: 6000,
            });
            // Update permission state if we know it's user denial
            setHasDisplayMediaPermission(false);
        }
      } else if (error.name === 'NotFoundError') {
          sonnerToast.error("No Screen Found", {
             description: "No screen, window, or tab was selected for recording.",
             duration: 5000,
          });
      } else if (error.name === 'NotSupportedError' || error.name === 'SecurityError') {
            sonnerToast.error("Recording Unavailable", {
                description: "Can't start recording here. This might be due to browser/OS restrictions, security policies, or lack of HTTPS.",
                duration: 7000,
            });
            // We can assume permission is not available in this context
            setHasDisplayMediaPermission(false);
      } else {
        sonnerToast.error("Recording Failed", {
          description: `Could not start recording: ${error.message || 'Unknown error'}`,
          duration: 5000,
        });
      }

      // Ensure state is reset if start fails
      setRecording(false);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    }
  };

  const stopRecording = () => {
    console.log("Stop recording requested.");
    // Check if the recorder exists and is actually recording
    if (mediaRecorder.current && mediaRecorder.current.state === "recording") {
       console.log("Stopping MediaRecorder.");
       try {
           mediaRecorder.current.stop(); // The onstop handler will manage the rest
           sonnerToast.info("Recording Stopped", { description: "Processing video...", duration: 2000 });
       } catch (e) {
           console.error("Error stopping MediaRecorder:", e);
            // Force cleanup if stop fails
            if (streamRef.current) {
               streamRef.current.getTracks().forEach(track => track.stop());
               streamRef.current = null;
            }
           setRecording(false);
           recordedChunks.current = []; // Clear potentially corrupted chunks
           sonnerToast.error("Stop Error", { description: "Failed to properly stop the recorder." });
       }
    } else if (streamRef.current) {
       // If recorder isn't recording but stream exists (e.g., user cancelled prompt after granting permission)
       console.log("Stopping MediaStream tracks directly (recorder not active).");
       streamRef.current.getTracks().forEach(track => track.stop());
       streamRef.current = null;
       setRecording(false); // Ensure recording state is false
       recordedChunks.current = []; // Clear any stray chunks
    } else {
        console.log("No active recording or stream to stop.");
        // Ensure state consistency if called multiple times or unexpectedly
        if (recording) { // Only update state if it thinks it's recording
          setRecording(false);
        }
        if (mediaRecorder.current?.state && mediaRecorder.current.state !== "inactive") {
           console.warn(`MediaRecorder state is: ${mediaRecorder.current.state}, but stop wasn't triggered correctly.`);
        }
    }
  };

   // Function to copy text to clipboard
   const copyToClipboard = (text: string) => {
       if (!navigator.clipboard) {
           sonnerToast.error("Clipboard API not available.");
           return;
       }
       navigator.clipboard.writeText(text).then(() => {
           sonnerToast.success("Copied to clipboard!");
       }, (err) => {
           console.error('Failed to copy text: ', err);
           sonnerToast.error("Failed to copy.");
       });
   };


  // --- Preview Modal ---
    const openPreviewModal = async (gofilePageUrl: string, linkFilename: string) => {
        if (isLoadingPreview) return; // Prevent multiple fetches

        console.log("Attempting to fetch HTML for GoFile page:", gofilePageUrl);
        setLoadingPreviewUrl(gofilePageUrl); // Track which GoFile PAGE link is loading
        setIsLoadingPreview(true);
        setPreviewHtml(null); // Clear previous HTML
        setPreviewError(null); // Clear previous errors
        setIsPreviewModalOpen(true); // Open modal immediately to show loader

        try {
            // Call the API route to get the raw HTML content
            const response = await fetch(`/api/gofile-media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: gofilePageUrl }), // Send the GoFile PAGE url
            });

            const data: HtmlPreviewData | ErrorResponse = await response.json();

            if (!response.ok || 'error' in data) {
                throw new Error((data as ErrorResponse).error || `Failed to fetch HTML content (status ${response.status})`);
            }

            if (!data.htmlContent) {
                throw new Error("API response missing required HTML content.");
            }

            setPreviewHtml(data.htmlContent); // Store the fetched HTML
            console.log("HTML content obtained successfully.");

        } catch (error: any) {
            console.error("Error fetching HTML preview:", error);
            const errorMessage = error.message || "Could not load HTML preview.";
            setPreviewError(errorMessage); // Set specific error for the modal
            sonnerToast.error("Preview Failed", { description: errorMessage });
            // Don't close modal on error, show error message inside
        } finally {
            setIsLoadingPreview(false);
            setLoadingPreviewUrl(null); // Clear loading tracker
        }
    };


  // Render loading state until client is ready and initial settings are determined
  if (!isClient || initialResolution === null || initialFrameRate === null || isCheckingPermission) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background text-foreground">
        <h1 className="text-3xl font-bold mb-6 text-primary">Resolution Recorder</h1>
        <Card className="w-full max-w-md p-6 shadow-lg rounded-lg border border-border">
          <CardHeader className="p-0 pb-4">
            <CardTitle className="text-xl text-center">Recording Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-0">
            <div className="text-center text-muted-foreground flex items-center justify-center">
               <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {isCheckingPermission ? 'Checking permissions...' : 'Initializing...'}
            </div>
            {/* Render disabled selects as placeholders */}
            <div className="flex flex-col space-y-2">
                <Label htmlFor="resolution-loading" className="text-sm font-medium opacity-50">Resolution</Label>
                 <Select disabled>
                    <SelectTrigger id="resolution-loading"><SelectValue placeholder="Loading..." /></SelectTrigger>
                 </Select>
            </div>
             <div className="flex flex-col space-y-2">
                <Label htmlFor="framerate-loading" className="text-sm font-medium opacity-50">Frame Rate</Label>
                 <Select disabled>
                    <SelectTrigger id="framerate-loading"><SelectValue placeholder="Loading..." /></SelectTrigger>
                 </Select>
             </div>
          </CardContent>
          <CardFooter className="flex justify-center pt-6 p-0">
            <Button className="w-full" disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {isCheckingPermission ? 'Checking...' : 'Loading...'}
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }


   const getButtonState = () => {
     if (recording) return { disabled: false, text: 'Stop Recording' };
     if (isUploading) return { disabled: true, text: 'Uploading...' };
     // Disable button if permission is explicitly denied
     if (hasDisplayMediaPermission === false) {
        return { disabled: true, text: 'Permissions Required' };
     }
      // Disable if permission check is still ongoing
     if (isCheckingPermission) {
         return { disabled: true, text: 'Checking Permissions...' };
     }
     // Enable button if permission is granted (true) or undetermined (null - will prompt)
     if (!selectedResolution || frameRate === null) {
         return { disabled: true, text: 'Select Settings' }; // More informative than 'Initializing'
     }
     return { disabled: false, text: 'Start Recording' };
   };

  const buttonState = getButtonState();


  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background text-foreground">
      {/* <Toaster richColors position="top-center" /> */} {/* Removed: Toaster is in layout.tsx */}
      <h1 className="text-3xl font-bold mb-6 text-primary">Resolution Recorder</h1>

      <Card className="w-full max-w-md p-6 shadow-lg rounded-lg border border-border mb-8">
        <CardHeader className="p-0 pb-4">
          <CardTitle className="text-xl text-center">Recording Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-0">
          {/* Resolution Select */}
          <div className="flex flex-col space-y-2">
            <Label htmlFor="resolution" className="text-sm font-medium">Resolution</Label>
            <Select
              // Use the initial value determined on the client
              value={selectedResolution?.label || ''}
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

          {/* Frame Rate Select */}
          <div className="flex flex-col space-y-2">
            <Label htmlFor="frameRate" className="text-sm font-medium">Frame Rate</Label>
            <Select
               // Use the initial value determined on the client
              value={frameRate?.toString() || ''}
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
            disabled={buttonState.disabled} // Use calculated button state
            aria-label={recording ? "Stop screen recording" : "Start screen recording"}
          >
            {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {buttonState.text}
          </Button>
        </CardFooter>
      </Card>

      {/* Display Preview, Upload Status, and Links */}
      <div className="w-full max-w-2xl space-y-6">
        {/* Video Preview - Always show if videoURL (local blob) exists */}
        {videoURL && (
          <Card className="p-4 shadow-md border border-border">
            <CardHeader className="p-0 pb-3">
              <CardTitle className="text-lg text-center">Last Recording Preview (Local)</CardTitle>
            </CardHeader>
            <CardContent className="p-0 space-y-3">
              <video
                src={videoURL}
                controls
                autoPlay={false} // Don't autoplay the preview
                className="rounded-md shadow-sm w-full aspect-video border border-border bg-muted" // Added background color
                aria-label="Screen recording preview"
                key={videoURL} // Add key to force re-render when URL changes
              />
            </CardContent>
            <CardFooter className="p-0 pt-4 flex flex-wrap justify-center gap-4">
              {/* Local Download Button */}
              <a
                href={videoURL}
                // Generate filename based on current settings when download is clicked
                download={`recording-${selectedResolution?.label.split(' ')[0] || 'unknown'}-${frameRate || 'unknown'}fps.${mimeTypeToExtension(mimeType)}`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                Download Locally
              </a>
              {/* GoFile Link Section (if available and not uploading) */}
              {gofileLink && !isUploading && (
                <div className="flex items-center space-x-2">
                  <a
                    href={gofileLink} // Link to the GoFile PAGE URL
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline font-medium text-sm truncate max-w-[200px]" // Added truncate
                    title={gofileLink}
                  >
                    GoFile Link
                  </a>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(gofileLink)}>
                    <Copy className="h-4 w-4" />
                    <span className="sr-only">Copy GoFile link</span>
                  </Button>
                </div>
              )}
            </CardFooter>
          </Card>
        )}

         {/* Display upload error if any */}
         {uploadError && !isUploading && (
            <Card className="p-3 bg-destructive/10 border border-destructive text-destructive rounded-md text-center">
                <CardHeader className="p-0 pb-1"><CardTitle className="text-base">Upload Failed</CardTitle></CardHeader>
                <CardContent className="p-0"><p className="text-sm">{uploadError}</p></CardContent>
            </Card>
         )}
      </div>


       {/* Recorded Links Table */}
        {recordedLinks.length > 0 && (
            <Card className="w-full max-w-4xl mt-12 p-4 shadow-lg rounded-lg border border-border">
                <CardHeader className="p-0 pb-4">
                    <CardTitle className="text-xl text-center">Recording History (Last 50)</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableCaption>Your recent GoFile recording links (stored in browser cookies).</TableCaption>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[35%]">Filename</TableHead>
                                <TableHead className="w-[25%]">Recorded On</TableHead>
                                <TableHead className="w-[10%] text-center">Preview</TableHead>
                                <TableHead className="text-center w-[15%]">Link</TableHead>
                                <TableHead className="text-right w-[15%]">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {recordedLinks.map((link) => (
                                <TableRow key={link.url}>
                                    <TableCell className="font-medium truncate max-w-xs" title={link.filename}>
                                        {link.filename}
                                    </TableCell>
                                    <TableCell>{new Date(link.timestamp).toLocaleString()}</TableCell>
                                    <TableCell className="text-center">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={() => openPreviewModal(link.url, link.filename)}
                                            disabled={isLoadingPreview && loadingPreviewUrl === link.url} // Disable if loading this specific preview
                                            title="Preview HTML"
                                        >
                                            {isLoadingPreview && loadingPreviewUrl === link.url ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Code className="h-5 w-5 text-muted-foreground hover:text-accent" /> // Use Code icon for HTML preview
                                            )}
                                            <span className="sr-only">Preview HTML</span>
                                        </Button>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <a
                                            href={link.url} // Link to the GoFile PAGE url
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={cn(buttonVariants({ variant: "link", size: "sm" }), "px-1")}
                                        >
                                            Open
                                        </a>
                                    </TableCell>
                                    <TableCell className="text-right space-x-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={() => copyToClipboard(link.url)} // Copy the GoFile PAGE url
                                            title="Copy link"
                                        >
                                            <Copy className="h-4 w-4" />
                                            <span className="sr-only">Copy link</span>
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-destructive hover:text-destructive"
                                            onClick={() => deleteLinkFromCookie(link.url)}
                                             title="Delete link from history"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                            <span className="sr-only">Delete link</span>
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        )}

         {/* HTML Preview Modal */}
        <Dialog open={isPreviewModalOpen} onOpenChange={setIsPreviewModalOpen}>
          <DialogContent className="sm:max-w-[80vw] max-h-[90vh] flex flex-col p-0"> {/* Removed default padding */}
            <DialogHeader className="p-4 border-b border-border">
              <DialogTitle>HTML Preview</DialogTitle>
              <DialogDescription>View the raw HTML source fetched from the GoFile page.</DialogDescription>
            </DialogHeader>

            {isLoadingPreview && (
                 <div className="flex flex-col items-center justify-center h-[50vh]">
                   <Loader2 className="h-8 w-8 animate-spin text-primary" />
                   <p className="mt-2 text-muted-foreground">Loading HTML preview...</p>
                 </div>
            )}

            {!isLoadingPreview && previewError && (
                 <div className="flex flex-col items-center justify-center h-[50vh] text-destructive p-4 text-center">
                    <Code className="h-10 w-10 mb-3" /> {/* Use Code icon for error */}
                    <p className="font-semibold">Failed to load preview</p>
                    <p className="text-sm">{previewError}</p>
                 </div>
            )}

            {/* HTML Content Area */}
            {!isLoadingPreview && !previewError && previewHtml && (
                 <ScrollArea className="flex-grow border-t border-border relative"> {/* Make ScrollArea relative */}
                   {/* Copy Button positioned absolutely inside ScrollArea */}
                   <Button
                     variant="outline"
                     size="icon"
                     className="absolute top-2 right-2 z-10 h-7 w-7"
                     onClick={() => copyToClipboard(previewHtml)}
                     title="Copy HTML"
                   >
                     <Copy className="h-4 w-4" />
                     <span className="sr-only">Copy HTML</span>
                   </Button>
                    <pre className="text-xs p-4 whitespace-pre-wrap break-all">
                        <code>
                            {previewHtml}
                        </code>
                    </pre>
                 </ScrollArea>
            )}


            <DialogFooter className="p-4 border-t border-border sm:justify-end mt-auto"> {/* Ensure footer is at the bottom */}
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  Close
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>


    </div>
  );
}

// Helper to get appropriate file extension based on MIME type
function mimeTypeToExtension(mimeType?: string | null): string {
    if (!mimeType) return 'webm'; // Default
    if (mimeType.includes('mp4')) return 'mp4';
    if (mimeType.includes('webm')) return 'webm';
    if (mimeType.includes('opus')) return 'opus';
    if (mimeType.includes('ogg')) return 'ogg';
    // Add more mappings if needed for other types (e.g., 'mov')
    return 'bin'; // Fallback for unknown types
}
