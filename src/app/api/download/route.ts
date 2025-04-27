// app/api/download/route.ts
import { NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio'; // Keep cheerio for potential future use, but not used in this version

// Define a type for the error response for better clarity
interface ErrorResponse {
  error: string;
}

// Define a type for the success response (HTML content)
interface HtmlResponse {
  html: string;
}


// THIS VERSION IS FOR DEBUGGING: It returns the raw HTML of the GoFile page.
export async function GET(request: Request): Promise<NextResponse<HtmlResponse | ErrorResponse>> {
  const { searchParams } = new URL(request.url);
  const downloadPageUrl = searchParams.get('url');

  if (!downloadPageUrl) {
    return NextResponse.json({ error: 'Download page URL is required' }, { status: 400 });
  }

  console.log(`[Debug API] Fetching GoFile page HTML for debugging: ${downloadPageUrl}`);

  try {
    // Fetch the download page HTML
    const response = await axios.get(downloadPageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 15000,
      maxRedirects: 5,
      responseType: 'text', // Fetch as text/html
    });

     // Return the raw HTML content for debugging
     console.log(`[Debug API] Successfully fetched HTML for ${downloadPageUrl}. Returning content.`);
     return NextResponse.json({ html: response.data }, {
        status: 200,
        headers: {
            'Content-Type': 'application/json', // Return JSON containing the HTML
            'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
     });

    /* // --- Original Code (for fetching file) ---
    // Load HTML into cheerio for parsing
    const $ = cheerio.load(response.data);
    const downloadLink = $('div.item-mediaplayer video source').attr('src');

    if (!downloadLink) {
      console.error(`Download link selector ('div.item-mediaplayer video source') failed for page: ${downloadPageUrl}`);
      const mainContentName = $('#filemanager_maincontent_name').text();
      if (!mainContentName) {
         console.warn("Could not find main content name (#filemanager_maincontent_name) either, page structure might have changed significantly or content is unavailable.");
         return NextResponse.json({ error: 'Content structure unrecognizable or file unavailable.' }, { status: 404 });
      }
      console.warn(`Found main content name '${mainContentName}', but no video source link found. The file might not be directly playable or the page structure for the player has changed.`);
      return NextResponse.json({ error: 'Download link not found within the media player. File might not be playable.' }, { status: 404 });
    }

    console.log(`Extracted download link: ${downloadLink}`);

    // Fetch the actual file content
    const fileResponse = await axios.get(downloadLink, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36',
        'Referer': downloadPageUrl,
      },
       timeout: 60000,
    });

    const contentType = fileResponse.headers['content-type'] || 'application/octet-stream';
    const urlPath = new URL(downloadLink).pathname;
    const filename = decodeURIComponent(urlPath.substring(urlPath.lastIndexOf('/') + 1)) || 'downloaded_file';

    console.log(`Serving file: ${filename}, Type: ${contentType}, Size: ${fileResponse.data.byteLength}`);

    return new NextResponse(fileResponse.data, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Accept-Ranges': 'bytes',
        'Content-Length': fileResponse.data.byteLength.toString(),
      },
    });
    // --- End Original Code --- */

  } catch (error: any) {
     console.error('[Debug API] Error fetching GoFile page HTML:', {
       url: downloadPageUrl,
       message: error.message,
       code: error.code,
       status: error.response?.status,
     });

     let status = 500;
     let message = 'Failed to fetch GoFile page HTML';

     if (axios.isAxiosError(error)) {
        if (error.response) {
            status = error.response.status;
            message = `Failed to fetch GoFile page: Server responded with status ${status}`;
             if (status === 404) message = 'GoFile page not found (404).';
             else if (status === 403) message = 'Access denied to GoFile page (403).';
        } else if (error.request) {
             message = 'Failed to fetch GoFile page: No response received from server.';
             status = 504;
        } else {
            message = `Failed to fetch GoFile page: Error setting up request (${error.message})`;
        }
     } else if (error instanceof Error) {
         message = `Failed to process GoFile page request: ${error.message}`;
     }

    return NextResponse.json({ error: message }, { status });
  }
}
