import { useState, useEffect, useRef } from 'react'
import Papa from 'papaparse'
import './App.css'

function App() {
  const [csvData, setCsvData] = useState(null)
  const [icsFiles, setIcsFiles] = useState({})
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  const [googleReady, setGoogleReady] = useState(false)
  const [scriptLoadAttempts, setScriptLoadAttempts] = useState(0)
  const [googleApiError, setGoogleApiError] = useState(null)
  const [googleAccessToken, setGoogleAccessToken] = useState(null)
  const googleTokenClientRef = useRef(null)
  const [successMessage, setSuccessMessage] = useState(null)

  useEffect(() => {
    waitForGoogleScripts()
  }, [])

  const handleGoogleTokenResponse = (tokenResponse) => {
    console.log('Google token response received:', tokenResponse)

    if (tokenResponse.error) {
      console.error('Google token response error:', tokenResponse)
      setGoogleApiError(`Google authorization failed: ${tokenResponse.error}`)
      return
    }

    if (!tokenResponse.access_token) {
      console.error('No access token in response:', tokenResponse)
      setGoogleApiError('Failed to obtain Google access token')
      return
    }

    console.log('Google access token obtained successfully')
    setGoogleAccessToken(tokenResponse.access_token)
    setGoogleApiError(null)
    setError(null) // Clear any previous error
  }

  const waitForGoogleScripts = () => {
    if (window.google?.accounts?.oauth2?.initTokenClient) {
      console.log('Google Identity Services script loaded, initializing...')
      initializeGoogleAPI()
      return
    }

    // Check if script element exists
    const scriptElement = document.querySelector('script[src*="accounts.google.com/gsi/client"]')
    if (!scriptElement) {
      console.error('Google Identity Services script not found in DOM')
      setGoogleApiError('Google Identity Services script not loaded. Please refresh the page.')
      return
    }

    setScriptLoadAttempts(prev => {
      const newAttempts = prev + 1
      if (newAttempts > 100) { // 10 seconds timeout
        console.error('Timeout waiting for Google Identity Services script')
        setGoogleApiError('Google Identity Services script failed to load. Please check your internet connection and refresh the page.')
        return newAttempts
      }

      setTimeout(waitForGoogleScripts, 100)
      return newAttempts
    })
  }

  const initializeGoogleAPI = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID

    if (!clientId) {
      console.warn('Google API credentials not found. Calendar integration will not work.')
      setGoogleApiError('Google API credentials not configured')
      return
    }

    if (!window.google?.accounts?.oauth2?.initTokenClient) {
      console.error('Google Identity Services library not loaded')
      setGoogleApiError('Google Identity Services library not loaded. Please refresh the page.')
      return
    }

    setGoogleApiError(null)

    window.googleTokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/calendar.events',
      callback: handleGoogleTokenResponse
    })
    googleTokenClientRef.current = window.googleTokenClient
    console.log('Google token client initialized successfully')
    setGoogleReady(true)
  }

  const retryGoogleAPI = () => {
    setScriptLoadAttempts(0)
    waitForGoogleScripts()
  }

  const handleLogin = () => {
    if (!googleTokenClientRef.current) {
      setError('Google token client not initialized. Please refresh the page.')
      return
    }

    try {
      // Check if popups are blocked
      const testPopup = window.open('', '_blank', 'width=1,height=1')
      if (!testPopup || testPopup.closed) {
        setError('Popups appear to be blocked. Please allow popups for this site and try again.')
        return
      }
      testPopup.close()

      googleTokenClientRef.current.requestAccessToken()
    } catch (error) {
      console.error('Error requesting access token:', error)
      setError(`Failed to request Google authorization: ${error.message}`)
    }
  }

  const handleCsvUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return

    Papa.parse(file, {
      complete: (results) => {
        try {
          const rows = results.data.filter(row => row.length > 0 && row[0] !== '')
          
          if (rows.length < 4) {
            throw new Error('CSV file too short. Must contain meeting info and attendee list.')
          }

          const meetingHeaders = rows[0].map(h => h.trim())
          const meetingValues = rows[1]
          const meeting = {}
          meetingHeaders.forEach((header, i) => {
            meeting[header] = meetingValues[i]
          })

          const attendeeHeaders = rows[2].map(h => h.trim())
          const attendees = rows.slice(3).map(row => {
            const attendee = {}
            attendeeHeaders.forEach((header, i) => {
              attendee[header] = row[i]
            })
            return attendee
          })

          setCsvData({ meeting, attendees })
          setError(null)
        } catch (err) {
          setError(`Invalid CSV format: ${err.message}`)
          setCsvData(null)
        }
      },
      error: (err) => {
        setError(`Failed to parse CSV: ${err.message}`)
      }
    })
  }

  const handleIcsUpload = (e) => {
    const files = Array.from(e.target.files)
    const newIcsFiles = { ...icsFiles }

    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = (event) => {
        newIcsFiles[file.name] = event.target.result
        setIcsFiles({ ...newIcsFiles })
      }
      reader.readAsText(file)
    })
  }

  const analyzeMeeting = async () => {
    if (!csvData) {
      setError('Please upload a CSV file first')
      return
    }

    setLoading(true)
    setError(null)
    setResults(null)

    try {
      const prompt = `
Analyze this meeting and calculate if it's worth having.

MEETING INFORMATION:
${JSON.stringify(csvData.meeting, null, 2)}

ATTENDEES:
${JSON.stringify(csvData.attendees, null, 2)}

ICS CALENDAR FILES:
${JSON.stringify(icsFiles, null, 2)}

Calculate the total dollar cost of this meeting based on attendee salaries and duration.
Return ONLY valid JSON with no other text, no markdown, no explanations before the JSON.
Use this EXACT structure:
{
  "dollar_cost": number,
  "verdict": "CALENDAR_CRIME" | "EMAIL" | "RESTRUCTURE" | "WORTH_IT",
  "explanation": string,
  "trimmed_attendees": string[],
  "removed_attendees": string[],
  "removed_reasons": string,
  "suggested_agenda": string,
  "suggested_time": string,
  "suggested_duration_mins": number
}
`

      const response = await fetch('http://localhost:3001/api/anthropic', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: 'You are a meeting ROI analyzer. Return ONLY valid JSON with no markdown code blocks, no backticks, no explanations. Start directly with the JSON object.',
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        })
      })

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`)
      }

      const data = await response.json()
      
      if (data.error) {
        throw new Error(data.error.message || 'API returned error')
      }
      
      if (!data.content || !data.content.length) {
        throw new Error('Invalid response from API')
      }
      
      const resultContent = data.content[0].text
      
      // Clean the response to extract JSON from markdown code blocks
      let jsonString = resultContent.trim()
      
      // Remove markdown code block markers if present
      if (jsonString.startsWith('```json')) {
        jsonString = jsonString.replace(/^```json\s*/, '').replace(/\s*```$/, '')
      } else if (jsonString.startsWith('```')) {
        jsonString = jsonString.replace(/^```\s*/, '').replace(/\s*```$/, '')
      }
      
      // Remove any leading/trailing whitespace
      jsonString = jsonString.trim()
      
      const parsedResult = JSON.parse(jsonString)
      setResults(parsedResult)

    } catch (err) {
      if (err.message === 'Failed to fetch') {
        setError('CORS restriction: The Anthropic API does not allow direct browser requests. This is expected security policy. For production use, implement a backend proxy server.')
      } else {
        setError(`Analysis failed: ${err.message}`)
      }
    } finally {
      setLoading(false)
    }
  }

  const createGoogleCalendarEvent = async (event) => {
    if (!googleAccessToken) {
      setError('No Google OAuth token available. Please authorize access before scheduling.')
      return
    }

    console.log('Creating Google Calendar event with OAuth token:', event)

    try {
      const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${googleAccessToken}`
        },
        body: JSON.stringify(event)
      })

      const data = await response.json()
      console.log('Google Calendar insert response:', data)

      if (!response.ok) {
        const responseMessage = data.error?.message || JSON.stringify(data)
        setError(`Failed to create event: ${responseMessage}`)
        return
      }

      setError(null)
      console.log('Event created successfully:', data)
      setSuccessMessage('✅ Meeting successfully scheduled in Google Calendar!')

      // Clear success message after 5 seconds
      setTimeout(() => {
        setSuccessMessage(null)
      }, 5000)
    } catch (error) {
      console.error('Failed to create Google Calendar event:', error)
      const responseMessage = error?.message || JSON.stringify(error)
      setError(`Failed to create event: ${responseMessage}`)
    }
  }

  const scheduleMeeting = () => {
    if (!googleAccessToken) {
      setError('Please login with Google first to schedule meetings.')
      return
    }

    if (!results) {
      setError('No meeting analysis result available to schedule.')
      return
    }

    const start = new Date(results.suggested_time)
    const end = new Date(start.getTime() + results.suggested_duration_mins * 60000)

    const event = {
      summary: csvData.meeting.meeting_title,
      description: results.suggested_agenda,
      start: {
        dateTime: start.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      end: {
        dateTime: end.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }
    }

    createGoogleCalendarEvent(event)
  }

  const getVerdictConfig = (verdict) => {
    const configs = {
      CALENDAR_CRIME: { color: 'verdict-crime', icon: '☠', label: 'Calendar Crime, don\'t even email' },
      EMAIL: { color: 'verdict-email', icon: '📧', label: "Should've Been an Email" },
      RESTRUCTURE: { color: 'verdict-restructure', icon: '⚠', label: 'Needs Restructuring' },
      WORTH_IT: { color: 'verdict-worthit', icon: '✅', label: 'Worth Having' }
    }
    return configs[verdict] || configs.RESTRUCTURE
  }

  return (
    <div className="app">
      <header className="header">
        <h1>The Email Test</h1>
        <p className="tagline">Find out if your meeting should've been an email</p>
        <div className="login-section">
          {!googleAccessToken ? (
            <button className="login-button" onClick={handleLogin} disabled={!googleReady}>
              {googleReady ? 'Login with Google' : 'Loading...'}
            </button>
          ) : (
            <span className="logged-in">Logged in ✓</span>
          )}
        </div>
      </header>

      <main className="main">
        {(error || googleApiError) && (
          <div className="error">
            {error || googleApiError}
          </div>
        )}

        {!results && !loading && (
          <div className="upload-section">
            <div className="upload-card">
              <h3>1. Upload Meeting CSV</h3>
              <input
                type="file"
                accept=".csv"
                onChange={handleCsvUpload}
                className="file-input"
              />
              {csvData && (
                <div className="file-success">
                  ✓ Loaded: {csvData.meeting.meeting_title} ({csvData.attendees.length} attendees)
                </div>
              )}
            </div>

            <div className="upload-card">
              <h3>2. Upload Calendar Files (.ics)</h3>
              <input
                type="file"
                accept=".ics"
                multiple
                onChange={handleIcsUpload}
                className="file-input"
              />
              {Object.keys(icsFiles).length > 0 && (
                <div className="file-success">
                  ✓ Loaded {Object.keys(icsFiles).length} calendar files
                </div>
              )}
            </div>

            <button
              className="analyze-button"
              onClick={analyzeMeeting}
              disabled={!csvData}
            >
              Analyze Meeting
            </button>
          </div>
        )}

        {loading && (
          <div className="loading">
            <div className="spinner"></div>
            <p>Consulting the oracle...</p>
          </div>
        )}

        {results && (
          <div className="results">
            <div className={`verdict ${getVerdictConfig(results.verdict).color}`}>
              <span className="verdict-icon">{getVerdictConfig(results.verdict).icon}</span>
              <span className="verdict-text">{getVerdictConfig(results.verdict).label}</span>
            </div>

            <div className="cost-display">
              This meeting will cost <span className="cost-value">${results.dollar_cost.toLocaleString()}</span>
            </div>

            <p className="explanation">{results.explanation}</p>

            <div className="attendee-columns">
              <div className="column">
                <h4>✅ Who should attend</h4>
                <ul>
                  {results.trimmed_attendees.map((name, i) => (
                    <li key={i}>{name}</li>
                  ))}
                </ul>
              </div>

              <div className="column">
                <h4>❌ Who can skip</h4>
                <ul>
                  {results.removed_attendees.map((name, i) => (
                    <li key={i}>{name}</li>
                  ))}
                </ul>
                <p className="reasons">{results.removed_reasons}</p>
              </div>
            </div>

            <div className="suggestions">
              <div className="suggestion-item">
                <h4>Suggested Time</h4>
                <p>{results.suggested_time}</p>
              </div>

              <div className="suggestion-item">
                <h4>Suggested Duration</h4>
                <p>{results.suggested_duration_mins} minutes</p>
              </div>

              <div className="suggestion-item full-width">
                <h4>Improved Agenda</h4>
                <p>{results.suggested_agenda}</p>
              </div>
            </div>

            <div className="schedule-section">
              {successMessage && (
                <div className="success-message">
                  {successMessage}
                </div>
              )}
              <button
                className="schedule-button"
                onClick={scheduleMeeting}
                disabled={!googleAccessToken}
              >
                {!googleAccessToken ? 'Login Required to Schedule' : 'Schedule the Improved Meeting'}
              </button>

              {googleApiError && (
                <div className="api-error">
                  <p>{googleApiError}</p>
                  <button className="retry-button" onClick={retryGoogleAPI}>
                    Retry Google API
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default App