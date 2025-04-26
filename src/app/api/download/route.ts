// app/api/download/route.ts
import { NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio'; // Changed from default import to namespace import

// Define a type for the error response for better clarity
interface ErrorResponse {
  error: string;
}

export async function GET(request: Request): Promise<NextResponse<Buffer | ErrorResponse>> {
  const { searchParams } = new URL(request.url);
  const downloadPageUrl = searchParams.get('url');

  if (!downloadPageUrl) {
    return NextResponse.json({ error: 'Download page URL is required' }, { status: 400 });
  }

  console.log(`Fetching GoFile page: ${downloadPageUrl}`);

  try {
    // Fetch the download page HTML
    const response = await axios.get(downloadPageUrl, {
      headers: {
        // Using a common browser User-Agent
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 15000, // Slightly longer timeout (15 seconds)
      maxRedirects: 5, // Follow redirects
    });

    // Load HTML into cheerio for parsing
    const $ = cheerio.load(response.data);

    // Find the download link from the video source tag
    // Based on the provided HTML: <div class="item-mediaplayer ..."><video ...><source src="..." ...></video></div>
    const downloadLink = $('div.item-mediaplayer video source').attr('src');

    if (!downloadLink) {
      console.error(`Download link selector ('div.item-mediaplayer video source') failed for page: ${downloadPageUrl}`);
      // Attempt to find alternative potential links or error messages if structure changes
      const mainContentName = $('#filemanager_maincontent_name').text();
      if (!mainContentName) {
         // If even the basic structure isn't there, it's likely a wrong URL or deleted file
         console.warn("Could not find main content name (#filemanager_maincontent_name) either, page structure might have changed significantly or content is unavailable.");
         return NextResponse.json({ error: 'Content structure unrecognizable or file unavailable.' }, { status: 404 });
      }
      // If the main content exists but the video source doesn't, the file might not be directly streamable or the selector needs an update
      console.warn(`Found main content name '${mainContentName}', but no video source link found. The file might not be directly playable or the page structure for the player has changed.`);
      return NextResponse.json({ error: 'Download link not found within the media player. File might not be playable.' }, { status: 404 });
    }

    console.log(`Extracted download link: ${downloadLink}`);

    // Fetch the actual file content
    const fileResponse = await axios.get(downloadLink, {
      responseType: 'arraybuffer', // Get data as ArrayBuffer
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36',
        // Add referer? Sometimes helps.
        'Referer': downloadPageUrl,
      },
       timeout: 60000, // Longer timeout for file download (60 seconds)
    });

    // Get content type and determine filename
    const contentType = fileResponse.headers['content-type'] || 'application/octet-stream';
    // Extract filename from URL path if possible, otherwise use a default
    const urlPath = new URL(downloadLink).pathname;
    // Decode URI component in case filename has encoded chars
    const filename = decodeURIComponent(urlPath.substring(urlPath.lastIndexOf('/') + 1)) || 'downloaded_file';

    console.log(`Serving file: ${filename}, Type: ${contentType}, Size: ${fileResponse.data.byteLength}`);

    // Return the file data as a NextResponse
    return new NextResponse(fileResponse.data, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        // Suggest a filename for the browser's save dialog
        'Content-Disposition': `attachment; filename="${filename}"`,
         // Set Cache-Control to prevent intermediaries from caching potentially large files
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Accept-Ranges': 'bytes', // Indicate support for range requests if the server does
        'Content-Length': fileResponse.data.byteLength.toString(), // Provide content length
      },
    });

  } catch (error: any) {
     console.error('Error fetching or processing GoFile media:', {
       url: downloadPageUrl,
       message: error.message,
       code: error.code,
       status: error.response?.status,
       // data: error.response?.data // Avoid logging potentially large response data
     });

     let status = 500;
     let message = 'Failed to fetch media';

     if (axios.isAxiosError(error)) {
        if (error.response) {
            // Server responded with a status code outside 2xx range
            status = error.response.status;
            message = `Failed to fetch media: Server responded with status ${status}`;
            if (status === 404) {
                 message = 'Media not found on GoFile (404). It might have expired or been deleted.';
            } else if (status === 403) {
                message = 'Access denied to GoFile media (403). Check permissions or token.';
            } else {
                // Try to get more specific error from response body if available
                try {
                    const errorData = typeof error.response.data === 'string' ? JSON.parse(error.response.data) : error.response.data;
                    message = errorData?.error || errorData?.message || `Server error ${status}`;
                } catch (e) { /* Ignore parsing error */ }
            }
        } else if (error.request) {
            // Request was made but no response received (e.g., network issue, timeout)
             message = 'Failed to fetch media: No response received from server (check network or GoFile status).';
             status = 504; // Gateway Timeout might be appropriate
        } else {
            // Error setting up the request
            message = `Failed to fetch media: Error setting up request (${error.message})`;
        }
     } else if (error instanceof Error && error.message.includes('Invalid server data')) {
         // Specific error from getBestServer parsing
         message = `Failed to communicate with GoFile API: ${error.message}`;
         status = 502; // Bad Gateway
     } else if (error instanceof Error) {
         // Non-axios errors (e.g., Cheerio parsing errors, URL parsing errors)
         message = `Failed to process media request: ${error.message}`;
     }

    return NextResponse.json({ error: message }, { status });
  }
}
