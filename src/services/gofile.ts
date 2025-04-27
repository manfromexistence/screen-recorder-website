/**
 * @fileOverview Service for uploading files to GoFile.io.
 */

const GOFILE_API_URL = 'https://api.gofile.io';

/**
 * Finds the best available GoFile server for uploading.
 * @returns {Promise<string>} The hostname of the best server.
 * @throws {Error} If unable to fetch server list or no servers available.
 */
async function getBestServer(): Promise<string> {
  try {
    const response = await fetch(`${GOFILE_API_URL}/servers`);

    // Check if the response status is OK (e.g., 200)
    if (!response.ok) {
      let errorBody = 'Unknown error';
      try {
        errorBody = await response.text(); // Attempt to get more details
      } catch (e) { /* ignore */ }
      console.error(`GoFile server list fetch failed with status: ${response.status}, Body: ${errorBody}`);
      throw new Error(`Failed to get GoFile server list: ${response.statusText}`);
    }

    // Try to parse the JSON response
    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      console.error("Error parsing GoFile server list JSON response:", jsonError);
      throw new Error("Failed to parse GoFile server list response.");
    }

    // Check the structure and status of the parsed data
    if (data.status !== 'ok') {
      console.error("GoFile API returned non-ok status for servers:", data);
      throw new Error(`GoFile server API error: ${data.status}`);
    }

    if (!data.data?.servers || !Array.isArray(data.data.servers) || data.data.servers.length === 0) {
      console.error("GoFile server list data is missing or empty:", data.data);
      throw new Error('No available GoFile servers found in the API response.');
    }

    // Simple strategy: pick the first server.
    // Add checks for server properties if necessary (e.g., if server.name exists)
    const firstServer = data.data.servers[0];
    if (!firstServer || typeof firstServer.name !== 'string') {
       console.error("Invalid server data found in the GoFile list:", firstServer);
       throw new Error('Invalid server data received from GoFile API.');
    }

    console.log("Selected GoFile server:", firstServer.name);
    return firstServer.name;

  } catch (error) {
    // Log the specific error before re-throwing
    if (error instanceof Error) {
        console.error(`Error getting GoFile server: ${error.message}`);
        throw error; // Re-throw the original error with its message
    } else {
        console.error("An unknown error occurred while getting GoFile server:", error);
        throw new Error("An unknown error occurred while contacting GoFile servers.");
    }
  }
}

/**
 * Uploads a file Blob to GoFile.
 * @param {Blob} fileBlob The file content as a Blob.
 * @param {string} filename The desired filename for the uploaded file.
 * @param {string} accountToken Your GoFile account token (optional but recommended).
 * @returns {Promise<string>} The URL to the download page.
 * @throws {Error} If the upload fails at any stage.
 */
export async function uploadToGoFile(fileBlob: Blob, filename: string, accountToken?: string): Promise<string> {
  let server;
  try {
    server = await getBestServer();
  } catch (serverError) {
    // If getting the server failed, throw that specific error
    throw serverError;
  }

  const uploadUrl = `https://${server}.gofile.io/uploadFile`;
  console.log(`Attempting upload to: ${uploadUrl}`);

  const formData = new FormData();
  formData.append('file', fileBlob, filename);

  if (accountToken) {
    formData.append('token', accountToken);
  }
  // You can add folderId here if needed: formData.append('folderId', 'yourFolderId');

  try {
    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
      // Note: Don't set Content-Type header when using FormData, browser handles it.
    });

    if (!response.ok) {
      let errorBody = 'Unknown error';
      try {
        // Attempt to parse JSON first, as GoFile might return structured errors
        const errorJson = await response.json();
        errorBody = errorJson.status || JSON.stringify(errorJson);
      } catch (e) {
         try {
            // Fallback to text if JSON parsing fails
            errorBody = await response.text();
         } catch (textErr) { /* ignore final fallback */ }
      }
      console.error(`GoFile upload failed with status: ${response.status}, Body: ${errorBody}`);
      throw new Error(`GoFile upload failed: ${response.statusText} (${errorBody})`);
    }

    // Try parsing the success response as JSON
    let result;
     try {
       result = await response.json();
     } catch (jsonError) {
       console.error("Error parsing GoFile upload success JSON response:", jsonError);
       throw new Error("Failed to parse GoFile upload success response.");
     }


    if (result.status !== 'ok') {
        console.error("GoFile API returned non-ok status after upload:", result);
      throw new Error(`GoFile API error after upload: ${result.status} - ${result.data?.message || 'No message'}`);
    }

    if (!result.data?.downloadPage) {
        console.error("GoFile API response missing download page URL:", result.data);
        throw new Error('GoFile API response missing download page URL.');
    }

    console.log('GoFile Upload Success:', result.data);
    return result.data.downloadPage; // Return the URL directly

  } catch (error) {
    // Log and re-throw errors caught during the fetch/processing
    if (error instanceof Error) {
        console.error(`Error during GoFile upload fetch/processing: ${error.message}`);
        throw error;
    } else {
        console.error("An unknown error occurred during GoFile upload fetch/processing:", error);
        throw new Error("An unknown error occurred during GoFile upload.");
    }
  }
}
