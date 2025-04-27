
// src/app/api/gofile-media/route.ts
import { NextResponse } from 'next/server';
import axios from 'axios';

// Define expected response structure from GoFile API (subset)
interface GoFileContentResponse {
  status: string;
  data?: {
    contents?: {
      [fileId: string]: {
        link: string;
        mimetype?: string; // Use optional chaining as field name might vary
        mimeType?: string; // Handle potential variations
        name: string;
      };
    };
    // Other potential fields like folderName, isOwner, etc.
  };
}

interface ErrorResponse {
  error: string;
}

interface SuccessResponse {
    downloadLink: string;
    mediaType: 'image' | 'video' | 'audio' | 'unsupported';
    mime: string;
}


export async function POST(request: Request): Promise<NextResponse<SuccessResponse | ErrorResponse>> {
  try {
    const { url } = await request.json();

    if (!url || typeof url !== 'string') {
         return NextResponse.json({ error: 'Invalid URL provided' }, { status: 400 });
    }

    // Extract contentId from URL (e.g., https://gofile.io/d/contentId)
    const urlParts = url.split('/');
    const contentId = urlParts[urlParts.length - 1];

    if (!contentId) {
      console.error(`[API /gofile-media] Could not extract contentId from URL: ${url}`);
      return NextResponse.json({ error: 'Invalid Gofile URL format' }, { status: 400 });
    }

    console.log(`[API /gofile-media] Processing contentId: ${contentId} for URL: ${url}`);

    // Access the token securely from environment variables
    const accountToken = process.env.GOFILE_ACCOUNT_TOKEN;
    if (!accountToken) {
        console.error("[API /gofile-media] GoFile Account Token not configured in environment variables.");
        // Avoid exposing token details in the error message
        return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
    }

    // Construct the GoFile API URL
    const apiUrl = `https://api.gofile.io/getContent?contentId=${contentId}&token=${accountToken}`;

    // Call the GoFile API
    const response = await axios.get<GoFileContentResponse>(apiUrl, {
      headers: {
        'Accept': 'application/json', // Request JSON response
      },
      timeout: 15000, // Set a reasonable timeout
    });

    // Check GoFile API status
    if (response.data.status !== 'ok') {
      console.error(`[API /gofile-media] GoFile API returned non-ok status for contentId ${contentId}:`, response.data);
      const errorMessage = `GoFile API error: ${response.data.status}`; // Avoid exposing too much detail
      // Map common GoFile errors to user-friendly messages
      if (response.data.status === 'error-notFound') {
        return NextResponse.json({ error: 'Content not found or invalid.' }, { status: 404 });
      }
      if (response.data.status === 'error-passwordRequired') {
        return NextResponse.json({ error: 'Content is password protected.' }, { status: 403 });
      }
       if (response.data.status === 'error-permissionDenied') {
         return NextResponse.json({ error: 'Permission denied to access this content.' }, { status: 403 });
       }
      return NextResponse.json({ error: errorMessage }, { status: 502 }); // Bad Gateway or similar
    }

    // Extract file details
    const contents = response.data.data?.contents;
    if (!contents || Object.keys(contents).length === 0) {
      console.error(`[API /gofile-media] No contents found in GoFile API response for contentId ${contentId}:`, response.data);
      return NextResponse.json({ error: 'No files found in this Gofile link.' }, { status: 404 });
    }

    // Assuming the first file in the contents object is the one we want
    // (Gofile links can sometimes contain multiple files in a folder)
    const fileId = Object.keys(contents)[0];
    const fileData = contents[fileId];

    if (!fileData || !fileData.link) {
        console.error(`[API /gofile-media] Missing file data or link in GoFile API response for fileId ${fileId}:`, fileData);
        return NextResponse.json({ error: 'Could not retrieve file details from Gofile.' }, { status: 500 });
    }

    const downloadLink = fileData.link;
    const mime = fileData.mimetype || fileData.mimeType || 'application/octet-stream'; // Get mime type, provide fallback

    console.log(`[API /gofile-media] Extracted details - Link: ${downloadLink}, Mime: ${mime}`);

    // Determine media type based on mime type
    let mediaType: 'image' | 'video' | 'audio' | 'unsupported';
    if (mime.startsWith('image/')) {
      mediaType = 'image';
    } else if (mime.startsWith('video/')) {
      mediaType = 'video';
    } else if (mime.startsWith('audio/')) {
      mediaType = 'audio';
    } else {
      mediaType = 'unsupported';
      console.warn(`[API /gofile-media] Unsupported media type detected: ${mime}`);
      // We can still return the link, but mark it as unsupported for the preview
      // return NextResponse.json({ error: `Unsupported media type: ${mime}` }, { status: 400 });
    }

    return NextResponse.json({ downloadLink, mediaType, mime });

  } catch (error: any) {
    console.error('[API /gofile-media] Error processing request:', {
      message: error.message,
      url: (await request.json().catch(() => ({}))).url || 'unknown', // Safely get URL from request body
      status: error.response?.status,
      code: error.code,
      response_data: error.response?.data, // Log response data if available
    });

    let status = 500;
    let message = 'Failed to process Gofile link';

    if (axios.isAxiosError(error)) {
      if (error.response) {
        status = error.response.status;
        message = `Gofile API request failed: Server responded with status ${status}`;
        if (status === 404) message = 'Gofile content not found (404).';
        else if (status === 401 || status === 403) message = 'Access denied by Gofile API (check token?).';
      } else if (error.request) {
        message = 'No response received from Gofile API server.';
        status = 504; // Gateway Timeout
      } else {
        message = `Error setting up request to Gofile API: ${error.message}`;
      }
    } else if (error instanceof Error) {
        // Handle JSON parsing errors from request body
        if (error instanceof SyntaxError && error.message.includes('JSON')) {
           message = "Invalid request format.";
           status = 400;
        } else {
           message = error.message;
        }
    }

    return NextResponse.json({ error: message }, { status });
  }
}
