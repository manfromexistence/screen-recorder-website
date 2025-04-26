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
      },
      timeout: 15000, // Add a timeout (15 seconds)
      maxRedirects: 5, // Follow redirects
    });

    // Load HTML into cheerio for parsing
    const $ = cheerio.load(response.data);

    // Find the download link from the video source tag
    // Based on the provided HTML: <div class="item-mediaplayer ..."><video ...><source src="..." ...></video></div>
    const downloadLink = $('div.item-mediaplayer video source').attr('src');

    if (!downloadLink) {
      console.error(`Download link not found on page: ${downloadPageUrl}`);
      // Attempt to find alternative potential links or error messages if structure changes
      const mainContentName = $('#filemanager_maincontent_name').text();
      if (!mainContentName) {
         console.warn("Could not find main content name either, page structure might have changed significantly or content is unavailable.");
         return NextResponse.json({ error: 'Content structure unrecognizable or file unavailable.' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Download link not found within the media player.' }, { status: 404 });
    }

    console.log(`Extracted download link: ${downloadLink}`);

    // Fetch the actual file content
    const fileResponse = await axios.get(downloadLink, {
      responseType: 'arraybuffer', // Get data as ArrayBuffer
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36',
      },
       timeout: 60000, // Longer timeout for file download (60 seconds)
    });

    // Get content type and determine filename
    const contentType = fileResponse.headers['content-type'] || 'application/octet-stream';
    // Extract filename from URL path if possible, otherwise use a default
    const urlPath = new URL(downloadLink).pathname;
    const filename = urlPath.substring(urlPath.lastIndexOf('/') + 1) || 'downloaded_file';

    console.log(`Serving file: ${filename}, Type: ${contentType}`);

    // Return the file data as a NextResponse
    return new NextResponse(fileResponse.data, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        // Suggest a filename for the browser's save dialog
        'Content-Disposition': `attachment; filename="${decodeURIComponent(filename)}"`,
         // Set Cache-Control to prevent intermediaries from caching potentially large files
        'Cache-Control': 'no-cache, no-store, must-revalidate',
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
            // Gofile might return specific error statuses
            status = error.response.status;
            message = `Failed to fetch media: Server responded with status ${status}`;
            if (status === 404) {
                 message = 'Media not found on GoFile (404). It might have expired or been deleted.';
            }
        } else if (error.request) {
            // Request was made but no response received (e.g., network issue, timeout)
             message = 'Failed to fetch media: No response received from server.';
             status = 504; // Gateway Timeout might be appropriate
        } else {
            // Error setting up the request
            message = `Failed to fetch media: Error setting up request (${error.message})`;
        }
     } else if (error instanceof Error) {
         // Non-axios errors (e.g., Cheerio parsing errors)
         message = `Failed to process media request: ${error.message}`;
     }

    return NextResponse.json({ error: message }, { status });
  }
}
