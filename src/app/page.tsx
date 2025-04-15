"use client";

import { Button } from "@/components/ui/button";
import { useState, useRef, useEffect } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function Home() {
  const [recording, setRecording] = useState(false);
  const [videoURL, setVideoURL] = useState<string | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);
  const [hasDisplayMediaPermission, setHasDisplayMediaPermission] = useState(true);
  const streamRef = useRef<MediaStream | null>(null); // Ref to store the stream


  useEffect(() => {
    const checkDisplayMediaPermission = async () => {
      try {
        // This might throw an error if the feature is disallowed by the permissions policy
        await navigator.mediaDevices.getDisplayMedia({ video: true });
        setHasDisplayMediaPermission(true);
      } catch (error) {
        console.error("Display media permission check failed:", error);
        setHasDisplayMediaPermission(false);
      }
    };

    checkDisplayMediaPermission();
  }, []);


  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "window", frameRate: 60 },
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

      { !hasDisplayMediaPermission && (
        <Alert variant="destructive">
          <AlertTitle>Screen Recording Permissions Required</AlertTitle>
          <AlertDescription>
            Please allow screen recording permissions in your browser settings to use this feature.
          </AlertDescription>
        </Alert>
      )}

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
