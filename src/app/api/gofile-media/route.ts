
// src/app/api/gofile-media/route.ts
import { NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio'; // Import cheerio correctly

// Define expected response structure from GoFile API (subset) - No longer needed for HTML fetching
// interface GoFileContentResponse { ... }

interface ErrorResponse {
  error: string;
}

// New interface for success response containing HTML
interface SuccessResponse {
    htmlContent: string;
}


export async function POST(request: Request): Promise<NextResponse<SuccessResponse | ErrorResponse>> {
  try {
    const { url } = await request.json();

    if (!url || typeof url !== 'string' || !url.includes('gofile.io/d/')) {
         return NextResponse.json({ error: 'Invalid Gofile URL provided' }, { status: 400 });
    }

    console.log(`[API /gofile-media] Fetching HTML for URL: ${url}`);

    // Fetch the download page HTML using axios
    const response = await axios.get<string>(url, { // Expect string response (HTML)
      headers: {
        // Set a realistic User-Agent to mimic a browser
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive',
      },
      timeout: 15000, // Set a reasonable timeout
      maxRedirects: 5, // Follow redirects if any
    });

    // Check if fetching the HTML was successful
    if (response.status !== 200) {
      console.error(`[API /gofile-media] Failed to fetch Gofile page HTML. Status: ${response.status}`);
      return NextResponse.json({ error: `Failed to fetch Gofile page. Status: ${response.status}` }, { status: response.status });
    }

    const htmlContent = response.data;

    // Basic check if we got some HTML content
    if (!htmlContent || typeof htmlContent !== 'string' || htmlContent.length < 100) {
         console.error(`[API /gofile-media] Received invalid or empty HTML content for URL: ${url}`);
         return NextResponse.json({ error: 'Failed to retrieve valid HTML content from the URL.' }, { status: 500 });
    }

    console.log(`[API /gofile-media] Successfully fetched HTML content for ${url}. Length: ${htmlContent.length}`);

    // Return the raw HTML content
    return NextResponse.json({ htmlContent });

  } catch (error: any) {
    let requestBodyUrl = 'unknown';
    try {
        // Safely try to get the URL from the request body again
        const body = await request.json();
        requestBodyUrl = body?.url || 'unknown';
    } catch (parseError) {
        // Ignore if parsing fails, keep 'unknown'
    }

    console.error('[API /gofile-media] Error processing request:', {
      message: error.message,
      url: requestBodyUrl,
      status: error.response?.status,
      code: error.code,
      response_data: error.response?.data, // Log response data if available
    });

    let status = 500;
    let message = 'Failed to process Gofile link';

    if (axios.isAxiosError(error)) {
      if (error.response) {
        // Error response from Gofile server
        status = error.response.status;
        message = `Gofile server request failed: Server responded with status ${status}`;
         if (status === 404) message = 'Gofile content not found (404).';
         else if (status === 403) message = 'Access forbidden by Gofile server (403).';
         else if (status === 429) message = 'Too many requests to Gofile server (429).';
      } else if (error.request) {
        // Request was made but no response received
        message = 'No response received from Gofile server.';
        status = 504; // Gateway Timeout
      } else {
        // Error setting up the request
        message = `Error setting up request to Gofile: ${error.message}`;
      }
    } else if (error instanceof SyntaxError && error.message.includes('JSON')) {
         // Handle JSON parsing errors from request body
         message = "Invalid request format.";
         status = 400;
    } else if (error instanceof Error) {
        message = error.message; // Use the generic error message
    }

    return NextResponse.json({ error: message }, { status });
  }
}
