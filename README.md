# NourishNear 🍲

> **🌐 Live Demo (Public URL):** [https://288334a6bae93a.lhr.life](https://288334a6bae93a.lhr.life)  
> *(Accessible on mobile phones, tablets, and laptops worldwide)*

NourishNear is a neighborhood food-sharing app with a Python/SQLite backend, location-aware food and request boards, donor-uploaded food photos, and a Groq-powered Hindi/English assistant. It can be installed as a Progressive Web App (PWA) from a supported browser.

## 🚀 Quick Run (Local or Public)

### 1-Click Launch (with Public Tunnel)
Double-click `run_public.bat` or run in PowerShell:
```powershell
.\run_public.ps1
```
This automatically starts the backend server on `http://127.0.0.1:8000` and creates a secure public HTTPS link for everyone.

### Manual Run
1. Install Python 3.9 or newer.
2. In PowerShell, open this folder and start the app:

   ```powershell
   py server.py
   ```

3. Open <http://127.0.0.1:8000>. The SQLite database is created as `nourishnear.db`.
4. To use Nourish AI, copy `.env.example` to `.env`, add a Groq Cloud key to `GROQ_API_KEY`, then restart the server:

   ```text
   GROQ_API_KEY=your-key
   ```

   Get a key from [Groq Console](https://console.groq.com/keys). Keep it private in `.env`; the key stays on the server and is never sent to the browser. Without it, food sharing and the database still work; the AI endpoint returns a clear setup message. Nourish AI answers general questions and uses current community listings, but has no live web-search capability and will say so for time-sensitive questions.

Install the app from the browser's **Install app** or **Add to Home Screen** menu while visiting the local site. The service worker caches the app shell; API calls still need the server and internet access for Groq.

## What is connected

- SQLite stores community food listings, meal requests, offers, pickup reservations, and saved listings. Posts are shared through the local server instead of browser-only storage.
- Donors can list extra home-cooked food or surplus from weddings, parties, community events, schools, and restaurants. People can post a food need with their area; donors can offer food to an open request, and the map shows needs and available food together. The map is driven by community posts—it cannot discover unreported needs or import requests from outside services.
- Quantity reservation and request matching are transactional, so two users cannot claim the same final servings or match one request twice.
- Each browser gets a persistent community ID for its own dashboard and saved items. Exact map pins are optional and are only returned to the request owner and the neighbor matched to that request. AI requests include neighborhood-level food details only—not names, request notes, or exact coordinates.
- Nourish AI uses Groq's OpenAI-compatible Chat Completions API and the `openai/gpt-oss-120b` model by default. It can use current food listings and open requests as context and answers in Hindi, Hinglish, or English. Requests include neighborhood-level food details only—not names, private request notes, or exact coordinates. It does not have live web search; for changing facts, verify with a current source.
- Donors can optionally add a JPEG, PNG, or WebP food photo. The browser resizes and compresses the photo to JPEG before upload; the server checks its encoded format and caps it at 900 KB. If no photo is added, the listing uses a representative category image.
- The community map uses Leaflet and OpenStreetMap and starts centered on Uttar Pradesh. Search and new post locations work worldwide through OpenStreetMap Nominatim; successful and unsuccessful lookups are cached in SQLite. Searches are user-triggered rather than autocomplete; set an identifying `GEOCODER_USER_AGENT` and follow the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/). OpenStreetMap attribution is shown on the map.
- Dashboard donation totals and area breakdowns come from the database. The visible sample posts are marked as demo data and must not be treated as live food availability or real requests.

## Important deployment limits

This is a working local MVP, not a publicly deployable production service: it has no account/password system, identity IDs are browser-generated, and the development server binds to `127.0.0.1`. Do not expose it to the public internet or put sensitive personal information in posts. A public launch needs HTTPS, real account authentication and authorization, abuse controls, backups, and a production WSGI/ASGI host.

Location access requires `localhost` or HTTPS. Distances on demo posts are illustrative; real map areas use the locations users enter. Geocoding and current-answer search require internet access. Places with the same name can be ambiguous, so include a city/state/country when needed.

## Tests

Run the backend tests with:

```powershell
py -m unittest discover -s tests -v
```
