
// src/app/api/gofile-media/route.ts
import { NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';
// Use dynamic import for ESM-only 'file-type'
// import { FileTypeResult, fromBuffer } from 'file-type';

export async function POST(request: Request) {
  let fromBuffer: any; // Declare variable for dynamic import
  let requestBody: { url?: string } = {}; // To store the parsed request body

  try {
    // Dynamically import 'file-type'
    const fileTypeModule = await import('file-type');
    fromBuffer = fileTypeModule.fromBuffer;

    // Try parsing request body early to use in error handling
    try {
        requestBody = await request.json();
    } catch (parseError) {
        console.error('[API /gofile-media] Error parsing request JSON:', parseError);
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { url } = requestBody;

    if (!url || !url.includes('gofile.io/d/')) {
      return NextResponse.json({ error: 'Invalid Gofile URL' }, { status: 400 });
    }
    console.log(`[API /gofile-media] Processing URL: ${url}`);

    // Fetch the download page HTML
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36',
      },
      timeout: 15000,
    });
    const html = response.data;

    // Parse HTML with Cheerio
    const $ = cheerio.load(html);
    // Updated selector based on provided HTML structure
    const downloadLink = $('div.item-mediaplayer video source').attr('src');

    if (!downloadLink) {
        console.error(`[API /gofile-media] Download link selector ('div.item-mediaplayer video source') failed for page: ${url}`);
        const mainContentName = $('#filemanager_maincontent_name').text();
         if (!mainContentName) {
             console.warn("[API /gofile-media] Could not find main content name (#filemanager_maincontent_name) either.");
             return NextResponse.json({ error: 'Content structure unrecognizable or file unavailable.' }, { status: 404 });
         }
         console.warn(`[API /gofile-media] Found main content name '${mainContentName}', but no video source link found.`);
         return NextResponse.json({ error: 'Download link not found within the media player.' }, { status: 404 });
    }

    console.log(`[API /gofile-media] Extracted download link: ${downloadLink}`);

    // Fetch the first few bytes of the media to determine its type
    const mediaResponse = await axios.get(downloadLink, {
        responseType: 'arraybuffer',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Range': 'bytes=0-4100' // Fetch first ~4KB for type detection (standard for file-type)
        },
        timeout: 20000,
        validateStatus: (status) => status >= 200 && status < 300 || status === 206, // Allow Partial Content
    });
    const buffer = Buffer.from(mediaResponse.data);
    const fileType = await fromBuffer(buffer);

    if (!fileType) {
      console.warn(`[API /gofile-media] Unable to determine media type for link: ${downloadLink}`);
      // Fallback: Try to infer from extension or assume video if not determinable
      const extension = downloadLink.split('.').pop()?.toLowerCase();
      let inferredMediaType = 'video'; // Default assumption
      let inferredMime = 'application/octet-stream';
      if (extension === 'webm' || extension === 'mp4' || extension === 'mov') {
        inferredMediaType = 'video';
        inferredMime = extension === 'mp4' ? 'video/mp4' : 'video/webm';
      } else if (extension === 'mp3' || extension === 'wav' || extension === 'ogg') {
        inferredMediaType = 'audio';
        inferredMime = extension === 'mp3' ? 'audio/mpeg' : 'audio/ogg';
      } else if (extension === 'jpg' || extension === 'jpeg' || extension === 'png' || extension === 'gif') {
        inferredMediaType = 'image';
        inferredMime = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : 'image/png';
      }
      console.log(`[API /gofile-media] Inferred type: ${inferredMediaType}, Mime: ${inferredMime}`);
      return NextResponse.json({ downloadLink, mediaType: inferredMediaType, mime: inferredMime });
      // return NextResponse.json({ error: 'Unable to determine media type from buffer' }, { status: 400 });
    }

    const mediaType = fileType.mime.startsWith('image/')
      ? 'image'
      : fileType.mime.startsWith('video/')
      ? 'video'
      : fileType.mime.startsWith('audio/')
      ? 'audio'
      : 'unsupported';

    if (mediaType === 'unsupported') {
        console.warn(`[API /gofile-media] Unsupported media type detected: ${fileType.mime}`);
      return NextResponse.json({ error: `Unsupported media type: ${fileType.mime}` }, { status: 400 });
    }

    console.log(`[API /gofile-media] Detected type: ${mediaType}, Mime: ${fileType.mime}`);
    return NextResponse.json({ downloadLink, mediaType, mime: fileType.mime });

  } catch (error: any) {
    // Use the url from the request body captured earlier, or fallback to axios config url, or 'Unknown URL'
    // Removed invalid 'rescue null' syntax here
    const originalUrl = requestBody?.url || error.config?.url || 'Unknown URL';
    console.error('[API /gofile-media] Error fetching media:', {
        message: error.message,
        url: originalUrl, // Use the captured/fallback URL
        status: error.response?.status,
        code: error.code,
    });

     let status = 500;
     let message = 'Failed to fetch or process GoFile media';

     if (axios.isAxiosError(error)) {
        if (error.response) {
            status = error.response.status;
            message = `Server responded with status ${status}`;
            if (status === 404) message = 'GoFile page or media not found (404).';
        } else if (error.request) {
             message = 'No response received from GoFile server.';
             status = 504; // Gateway Timeout
        } else {
            message = `Error setting up request: ${error.message}`;
        }
     } else if (error instanceof Error) {
         message = error.message; // Use the specific error message
     }

    return NextResponse.json({ error: message }, { status });
  }
}
