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
    if (!response.ok) {
      throw new Error(`Failed to get server list: ${response.statusText}`);
    }
    const data = await response.json();
    if (data.status !== 'ok' || !data.data.servers || data.data.servers.length === 0) {
      throw new Error('No available GoFile servers found.');
    }
    // Simple strategy: pick the first server. Could implement more complex logic (e.g., ping test).
    return data.data.servers[0].name;
  } catch (error) {
    console.error("Error getting GoFile server:", error);
    throw error; // Re-throw to be handled by the caller
  }
}

/**
 * Uploads a file Blob to GoFile.
 * @param {Blob} fileBlob The file content as a Blob.
 * @param {string} filename The desired filename for the uploaded file.
 * @param {string} accountToken Your GoFile account token (optional but recommended).
 * @returns {Promise<string|null>} The URL to the download page, or null on failure.
 */
export async function uploadToGoFile(fileBlob: Blob, filename: string, accountToken?: string): Promise<string | null> {
  try {
    const server = await getBestServer();
    const uploadUrl = `https://${server}.gofile.io/uploadFile`;

    const formData = new FormData();
    formData.append('file', fileBlob, filename);

    if (accountToken) {
      formData.append('token', accountToken);
    }
    // You can add folderId here if needed: formData.append('folderId', 'yourFolderId');

    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
      // Note: Don't set Content-Type header when using FormData, browser handles it.
    });

    if (!response.ok) {
      let errorBody = 'Unknown error';
      try {
        errorBody = await response.text(); // Attempt to get more details
      } catch (e) { /* ignore */}
      throw new Error(`GoFile upload failed: ${response.statusText} - ${errorBody}`);
    }

    const result = await response.json();

    if (result.status !== 'ok') {
      throw new Error(`GoFile API error: ${result.status} - ${result.data?.message || 'No message'}`);
    }

    if (!result.data || !result.data.downloadPage) {
        throw new Error('GoFile API response missing download page URL.');
    }

    console.log('GoFile Upload Success:', result.data);
    return result.data.downloadPage;

  } catch (error) {
    console.error("Error uploading to GoFile:", error);
    // Re-throw the specific error message for better feedback in the UI
    if (error instanceof Error) {
      throw error;
    } else {
      throw new Error("An unknown error occurred during GoFile upload.");
    }
  }
}
