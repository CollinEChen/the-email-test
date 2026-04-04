# Meeting ROI Analyzer

A React application that analyzes meeting costs and provides recommendations for optimization. Uses AI to calculate meeting ROI and integrates with Google Calendar for scheduling improved meetings.

## Features

- CSV upload for meeting and attendee data
- ICS calendar file analysis
- AI-powered meeting cost analysis
- Google Calendar integration for scheduling optimized meetings
- Backend proxy server for secure API calls

## Setup

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables in `.env`:
   ```
   ANTHROPIC_API_KEY=your_anthropic_api_key
   VITE_GOOGLE_CLIENT_ID=your_google_client_id
   VITE_GOOGLE_API_KEY=your_google_api_key
   ```

### Google Calendar API Setup

To enable Google Calendar integration:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Calendar API:
   - Go to "APIs & Services" > "Library"
   - Search for "Google Calendar API" and enable it
4. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth 2.0 Client IDs"
   - Set application type to "Web application"
   - Add authorized redirect URIs (for development: `http://localhost:5174`)
5. Create an API key:
   - Click "Create Credentials" > "API key"
6. Update your `.env` file with the credentials

### Running the Application

1. Start the backend server:
   ```bash
   npm run server
   ```

2. In a new terminal, start the frontend:
   ```bash
   npm run dev
   ```

3. Open [http://localhost:5174](http://localhost:5174) in your browser

## Troubleshooting

### Google Calendar API Issues

If you see "Failed to initialize Google Calendar API":

1. **Check Credentials**: Ensure your `VITE_GOOGLE_CLIENT_ID` and `VITE_GOOGLE_API_KEY` are correct
2. **OAuth Configuration**: Make sure `http://localhost:5174` is added as an authorized redirect URI in Google Cloud Console
3. **API Enabled**: Verify that the Google Calendar API is enabled in your Google Cloud project
4. **Refresh Page**: Try refreshing the page to reload the Google API script
5. **Use Retry Button**: Click the "Retry Google API" button if it appears

### CORS Issues

If you encounter CORS errors with the Anthropic API:
- The backend proxy server handles this automatically
- Make sure both the frontend (port 5174) and backend (port 3001) are running

## Usage

1. Upload a CSV file with meeting information and attendee details
2. Optionally upload ICS calendar files for additional context
3. Click "Analyze Meeting" to get AI-powered recommendations
4. Use "Schedule the Improved Meeting" to add the optimized meeting to Google Calendar

## Project Structure

- `src/App.jsx` - Main React component
- `server.js` - Express proxy server for API calls
- `public/example.csv` - Sample CSV format
- `.env` - Environment variables (API keys)