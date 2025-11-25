import os
import requests
from datetime import datetime
from typing import List, Dict, Optional
import dotenv
from datetime import timedelta

dotenv.load_dotenv()

# Configuration
SPOTIFY_CLIENT_ID = os.getenv('SPOTIFY_CLIENT_ID')
SPOTIFY_CLIENT_SECRET = os.getenv('SPOTIFY_CLIENT_SECRET')
SPOTIFY_REDIRECT_URI = os.getenv('SPOTIFY_REDIRECT_URI', 'http://localhost/callback/')
NOTION_TOKEN = os.getenv('NOTION_TOKEN')
NOTION_DATABASE_ID = os.getenv('NOTION_MUSIC_DATABASE_ID')

if not SPOTIFY_CLIENT_ID or not SPOTIFY_CLIENT_SECRET or not NOTION_TOKEN or not NOTION_DATABASE_ID:
    raise ValueError('Missing required environment variables')

# Token cache file
TOKEN_CACHE_FILE = 'spotify_tokens.json'

def save_tokens(access_token: str, refresh_token: str, expires_in: int) -> None:
    """Save tokens to a file."""
    import json
    token_data = {
        'access_token': access_token,
        'refresh_token': refresh_token,
        'expires_at': datetime.now().timestamp() + expires_in
    }
    with open(TOKEN_CACHE_FILE, 'w') as f:
        json.dump(token_data, f)

def load_tokens() -> Optional[Dict]:
    """Load tokens from cache file."""
    import json
    try:
        with open(TOKEN_CACHE_FILE, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return None

def get_authorization_url() -> str:
    """Generate Spotify authorization URL."""
    from urllib.parse import urlencode
    params = {
        'client_id': SPOTIFY_CLIENT_ID,
        'response_type': 'code',
        'redirect_uri': SPOTIFY_REDIRECT_URI,
        'scope': 'user-read-recently-played',
    }
    return f'https://accounts.spotify.com/authorize?{urlencode(params)}'

def get_tokens_from_code(code: str) -> Dict:
    """Exchange authorization code for tokens."""
    import base64
    auth_url = 'https://accounts.spotify.com/api/token'
    
    # Create basic auth header
    auth_str = f'{SPOTIFY_CLIENT_ID}:{SPOTIFY_CLIENT_SECRET}'
    auth_b64 = base64.b64encode(auth_str.encode()).decode()
    
    headers = {'Authorization': f'Basic {auth_b64}'}
    data = {
        'grant_type': 'authorization_code',
        'code': code,
        'redirect_uri': SPOTIFY_REDIRECT_URI,
    }
    
    response = requests.post(auth_url, headers=headers, data=data)
    response.raise_for_status()
    return response.json()

def refresh_access_token(refresh_token: str) -> Dict:
    """Refresh the access token."""
    import base64
    auth_url = 'https://accounts.spotify.com/api/token'
    
    auth_str = f'{SPOTIFY_CLIENT_ID}:{SPOTIFY_CLIENT_SECRET}'
    auth_b64 = base64.b64encode(auth_str.encode()).decode()
    
    headers = {'Authorization': f'Basic {auth_b64}'}
    data = {
        'grant_type': 'refresh_token',
        'refresh_token': refresh_token,
    }
    
    response = requests.post(auth_url, headers=headers, data=data)
    response.raise_for_status()
    return response.json()

def get_spotify_access_token() -> str:
    """Get valid Spotify access token, handling OAuth flow if needed."""
    # Try to load cached tokens
    token_data = load_tokens()
    
    if token_data:
        # Check if token is still valid
        if datetime.now().timestamp() < token_data['expires_at']:
            return token_data['access_token']
        
        # Token expired, refresh it
        print("Refreshing access token...")
        new_tokens = refresh_access_token(token_data['refresh_token'])
        save_tokens(
            new_tokens['access_token'],
            new_tokens.get('refresh_token', token_data['refresh_token']),
            new_tokens['expires_in']
        )
        return new_tokens['access_token']
    
    # No cached tokens, need to authorize
    print("\n=== Spotify Authorization Required ===")
    print("1. Visit this URL to authorize:")
    print(get_authorization_url())
    print("\n2. After authorizing, you'll be redirected to a URL.")
    print("3. Copy the 'code' parameter from that URL and paste it below.")
    
    code = input("\nEnter the authorization code: ").strip()
    
    # Exchange code for tokens
    tokens = get_tokens_from_code(code)
    save_tokens(tokens['access_token'], tokens['refresh_token'], tokens['expires_in'])
    
    print("✓ Authorization successful! Tokens saved.\n")
    return tokens['access_token']

def get_recently_played_tracks(access_token: str, limit: int = 50) -> List[Dict]:
    """Fetch recently played tracks from Spotify."""
    url = 'https://api.spotify.com/v1/me/player/recently-played'
    headers = {'Authorization': f'Bearer {access_token}'}
    params = {'limit': limit}
    
    response = requests.get(url, headers=headers, params=params)
    response.raise_for_status()
    return response.json()['items']

def get_latest_played_at_from_notion() -> Optional[str]:
    """Get the most recent playedAt timestamp from Notion DB."""
    url = f'https://api.notion.com/v1/databases/{NOTION_DATABASE_ID}/query'
    headers = {
        'Authorization': f'Bearer {NOTION_TOKEN}',
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
    }
    
    # Sort by playedAt descending and get just the first result
    data = {
        'sorts': [{'property': 'Played At', 'direction': 'descending'}],
        'page_size': 1
    }
    
    try:
        response = requests.post(url, headers=headers, json=data)
        response.raise_for_status()
        results = response.json()['results']
        
        if results:
            played_at_prop = results[0]['properties']['Played At']
            return played_at_prop['date']['start'] if played_at_prop.get('date') else None
        return None
    except requests.exceptions.HTTPError as e:
        error_detail = e.response.json() if e.response.content else {}
        print(f"Error querying Notion: {error_detail}")
        print("This might mean:")
        print("  - The database ID is incorrect")
        print("  - The integration doesn't have access to the database")
        print("  - The 'playedAt' property doesn't exist or is named differently")
        print("\nSkipping sync check, will add all tracks...")
        return None

def add_track_to_notion(track_data: Dict) -> None:
    """Add a new track row to Notion database."""
    url = 'https://api.notion.com/v1/pages'
    headers = {
        'Authorization': f'Bearer {NOTION_TOKEN}',
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
    }
    
    data = {
        'parent': {'database_id': NOTION_DATABASE_ID},
        'properties': {
            'Name': {'title': [{'text': {'content': track_data['name']}}]},
            'Artist': {'rich_text': [{'text': {'content': track_data['artist']}}]},
            'Album': {'rich_text': [{'text': {'content': track_data['album']}}]},
            'Played At': {'date': {'start': track_data['playedAt']}},
        }
    }
    
    # Add optional fields
    if track_data.get('url'):
        data['properties']['Spotify URL'] = {'url': track_data['url']}
    
    if track_data.get('image'):
        data['icon'] = {
            'type': 'external',
            'external': {'url': track_data['image']}
        }
    
    try:
        response = requests.post(url, headers=headers, json=data)
        response.raise_for_status()
    except requests.exceptions.HTTPError as e:
        error_detail = e.response.json() if e.response.content else {}
        print(f"\n❌ Error adding track to Notion:")
        print(f"Status: {e.response.status_code}")
        print(f"Error: {error_detail}")
        print(f"\nTrack data attempted:")
        import json
        print(json.dumps(data, indent=2))
        raise

def sync_spotify_to_notion():
    """Main sync function."""
    print("Starting Spotify to Notion sync...")
    
    # Get Spotify access token
    access_token = get_spotify_access_token()
    print("✓ Authenticated with Spotify")
    
    # Get recently played tracks
    tracks = get_recently_played_tracks(access_token)
    print(f"✓ Retrieved {len(tracks)} recent tracks from Spotify")
    
    # Get latest synced timestamp from Notion
    latest_played_at = get_latest_played_at_from_notion()
    print(f"✓ Latest synced track: {latest_played_at or 'None (empty database)'}")
    latest_played_at_dt = datetime.strptime(latest_played_at, '%Y-%m-%dT%H:%M:00.000+00:00') if latest_played_at else None
    
    # Process tracks in chronological order (oldest first)
    synced_count = 0
    # pretty print 10 items of track data
    with open('debug_tracks.json', 'w') as f:
        import json
        json.dump(tracks[:10], f, indent=2)
    
    for item in tracks:
        track = item['track']
        played_at = item['played_at']
        # print type of played_at
        played_at_dt = datetime.strptime(played_at, '%Y-%m-%dT%H:%M:%S.%fZ')
        played_at = played_at_dt.isoformat()
        # add 1 minute buffer to latest_played_at for comparison
        played_at_dt = played_at_dt - timedelta(minutes=1)
        print("last played",type(latest_played_at_dt))


        # Stop if we've already synced this timestamp + 1 minute buffer
        
        if latest_played_at_dt and played_at_dt <= latest_played_at_dt:
            print(f"✓ Reached already-synced tracks at {played_at}")
            break
        
        # Prepare track data
        track_data = {
            'id': track['id'],
            'name': track['name'],
            'artist': ', '.join([artist['name'] for artist in track['artists']]),
            'album': track['album']['name'],
            'url': track['external_urls'].get('spotify'),
            'playedAt': played_at,
            'image': track['album']['images'][0]['url'] if track['album']['images'] else None
        }
        
        # Add track row to Notion
        add_track_to_notion(track_data)
        synced_count += 1
        print(f"  → Added: {track_data['name']} by {track_data['artist']}")
        print(f"    Played at: {track_data['playedAt']}")
    
    print(f"\n✓ Sync complete! Added {synced_count} new tracks to Notion")

if __name__ == '__main__':
    sync_spotify_to_notion()