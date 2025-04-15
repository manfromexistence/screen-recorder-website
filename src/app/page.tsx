"use client";

import { Button } from "@/components/ui/button";
import { useState, useRef, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// Define available resolutions
const resolutions = [
  { label: "4K (3840x2160)", width: 3840, height: 2160 },
  { label: "1080p (1920x1080)", width: 1920, height: 1080 },
  { label: "720p (1280x720)", width: 1280, height: 720 },
  { label: "480p (854x480)", width: 854, height: 480 },
];

export default function Home() {
  const [recording, setRecording] = useState(false);
  const [videoURL, setVideoURL] = useState<string | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);
  const [hasDisplayMediaPermission, setHasDisplayMediaPermission] = useState(true);
  const streamRef = useRef<MediaStream | null>(null); // Ref to store the stream
  const [selectedResolution, setSelectedResolution] = useState(resolutions[1]); // Default to 1080p
  const [frameRate, setFrameRate] = useState(60);
  const { toast } = useToast();

  useEffect(() => {
    const checkDisplayMediaPermission = async () => {
      try {
        // This might throw an error if the feature is disallowed by the permissions policy
        await navigator.mediaDevices.getDisplayMedia({ video: true });
        setHasDisplayMediaPermission(true);
      } catch (error) {
        console.error("Display media permission check failed:", error);
        setHasDisplayMediaPermission(false);
        toast({
          variant: "destructive",
          title: "Screen Recording Permissions Required",
          description: "Please allow screen recording permissions in your browser settings to use this feature.",
        });
      }
    };

    checkDisplayMediaPermission();
  }, [toast]);


  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: selectedResolution.width,
          height: selectedResolution.height,
          frameRate: frameRate,
        },
        audio: true,
      });

      streamRef.current = stream; // Store the stream in the ref

      mediaRecorder.current = new MediaRecorder(stream, {
        mimeType: "video/webm;codecs=vp8,opus",
      });

      recordedChunks.current = []; // Clear existing chunks

      mediaRecorder.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunks.current.push(event.data);
        }
      };

      mediaRecorder.current.onstop = () => {
        const blob = new Blob(recordedChunks.current, {
          type: "video/webm",
        });
        const url = URL.createObjectURL(blob);
        setVideoURL(url);
        recordedChunks.current = [];
      };

      mediaRecorder.current.start();
      setRecording(true);
    } catch (error) {
      console.error("Error starting recording:", error);
      toast({
        variant: "destructive",
        title: "Error Starting Recording",
        description: "There was an issue starting the recording. Please check your permissions and try again.",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && mediaRecorder.current.state === "recording") {
      mediaRecorder.current.stop();
      setRecording(false);

      // Stop all tracks on the stream
      streamRef.current?.getTracks().forEach(track => track.stop());
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <h1 className="text-2xl font-semibold mb-4">Resolution Recorder</h1>

      <div className="flex flex-col space-y-2 mb-4 w-full max-w-md">
        <Label htmlFor="resolution">Resolution</Label>
        <Select onValueChange={(value) => {
          const res = resolutions.find((r) => r.label === value);
          if (res) {
            setSelectedResolution(res);
          }
        }}>
          <SelectTrigger id="resolution">
            <SelectValue placeholder={selectedResolution.label} />
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

      <div className="flex flex-col space-y-2 mb-4 w-full max-w-md">
        <Label htmlFor="frameRate">Frame Rate ({frameRate} fps)</Label>
        <Slider
          id="frameRate"
          defaultValue={[frameRate]}
          max={60}
          min={15}
          step={1}
          onValueChange={(value) => setFrameRate(value[0])}
        />
        <p className="text-sm text-muted-foreground">Adjust the video frame rate. Higher frame rates may require more processing power.</p>
      </div>


      <div className="flex space-x-4 mb-4">
        {!recording ? (
          <Button onClick={startRecording} className="bg-primary text-primary-foreground hover:bg-primary/80" disabled={!hasDisplayMediaPermission}>
            Start Recording
          </Button>
        ) : (
          <Button onClick={stopRecording} className="bg-destructive text-destructive-foreground hover:bg-destructive/80">
            Stop Recording
          </Button>
        )}
      </div>

      {videoURL && (
        <div className="mt-4">
          <video src={videoURL} controls width="640" height="360" className="rounded-md shadow-md" />
          <a
            href={videoURL}
            download="recorded-video.webm"
            className="block mt-2 text-accent hover:underline"
          >
            Download Video
          </a>
        </div>
      )}
    </div>
  );
}
