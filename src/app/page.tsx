"use client";

import { Button } from "@/components/ui/button";
import { useState, useRef } from "react";

export default function Home() {
  const [recording, setRecording] = useState(false);
  const [videoURL, setVideoURL] = useState<string | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "window", frameRate: 60 },
        audio: true,
      });

      mediaRecorder.current = new MediaRecorder(stream, {
        mimeType: "video/webm;codecs=vp9",
      });

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
    if (mediaRecorder.current) {
      mediaRecorder.current.stop();
      setRecording(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <h1 className="text-2xl font-semibold mb-4">Resolution Recorder</h1>
      <div className="flex space-x-4 mb-4">
        {!recording ? (
          <Button onClick={startRecording} className="bg-primary text-primary-foreground hover:bg-primary/80">
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
