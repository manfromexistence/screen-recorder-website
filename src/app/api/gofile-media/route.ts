
// src/app/api/gofile-media/route.ts
import { NextResponse } from 'next/server';
import axios from 'axios';

// Interface for API error response
interface ErrorResponse {
    error: string;
}

// Interface for success response containing HTML
interface SuccessResponse {
    htmlContent: string;
}


export async function POST(request: Request): Promise<NextResponse<SuccessResponse | ErrorResponse>> {
  let requestBodyUrl = 'unknown'; // Variable to hold URL for logging
  try {
    const { url } = await request.json();
    requestBodyUrl = url; // Store the URL for potential error logging

    if (!url || typeof url !== 'string' || !url.includes('gofile.io/d/')) {
         console.warn(`[API /gofile-media] Invalid URL received: ${url}`);
         return NextResponse.json({ error: 'Invalid Gofile URL provided' }, { status: 400 });
    }

    console.log(`[API /gofile-media] Fetching HTML for URL: ${url}`);

    // Fetch the download page HTML using axios
    const response = await axios.get<string>(url, { // Expect string response (HTML)
      headers: {
        // Set a realistic User-Agent to mimic a browser
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
      timeout: 20000, // Increased timeout slightly to 20 seconds
      maxRedirects: 5, // Follow redirects if any
      // Validate status ensures that only 2xx responses are considered successful
      validateStatus: function (status) {
        return status >= 200 && status < 300; // default
      },
    });

    // Note: If axios doesn't throw an error here, the status is considered valid (2xx) due to validateStatus

    const htmlContent = response.data;

    // Basic check if we got some HTML content
    if (!htmlContent || typeof htmlContent !== 'string' || htmlContent.length < 100) {
         console.warn(`[API /gofile-media] Received invalid or empty HTML content for URL: ${url}. Length: ${htmlContent?.length}`);
         return NextResponse.json({ error: 'Failed to retrieve valid HTML content from the URL.' }, { status: 500 });
    }

    console.log(`[API /gofile-media] Successfully fetched HTML content for ${url}. Length: ${htmlContent.length}`);

    // Return the raw HTML content
    return NextResponse.json({ htmlContent });

  } catch (error: any) {
    // Log detailed error information
    console.error('[API /gofile-media] Error processing request:', {
      message: error.message,
      url: requestBodyUrl, // Log the URL obtained earlier
      status: error.response?.status,
      statusText: error.response?.statusText,
      code: error.code,
      response_data_snippet: error.response?.data?.substring(0, 200), // Log a snippet of response data if available
    });

    let status = 500;
    let message = 'Failed to process Gofile link';

    if (axios.isAxiosError(error)) {
      if (error.response) {
        // Error response from Gofile server (e.g., 404, 403, 5xx)
        status = error.response.status;
        message = `Gofile server request failed: Server responded with status ${status} (${error.response.statusText})`;
         if (status === 404) message = 'Gofile content not found (404).';
         else if (status === 403) message = 'Access forbidden by Gofile server (403).';
         else if (status === 429) message = 'Too many requests to Gofile server (429).';
         else if (status >= 500) message = `Gofile server error (${status}). Please try again later.`;
      } else if (error.request) {
        // Request was made but no response received (e.g., timeout, network error)
        message = `No response received from Gofile server. ${error.message}`;
        status = 504; // Gateway Timeout
      } else {
        // Error setting up the request
        message = `Error setting up request to Gofile: ${error.message}`;
      }
    } else if (error instanceof SyntaxError && error.message.includes('JSON')) {
         // Handle JSON parsing errors from the initial request.json() call
         message = "Invalid request format.";
         status = 400;
    } else if (error instanceof Error) {
        message = error.message; // Use the generic error message for other errors
    }

    return NextResponse.json({ error: message }, { status });
  }
}
