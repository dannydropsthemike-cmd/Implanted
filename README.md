# implanted — Custom 3D Pet Decor

A single-page website for **implanted**, a small business that sells custom 3D-printed pet plant stakes.

## File Structure

```
implanted/
├── index.html   — HTML structure & all page content
├── styles.css   — All CSS (variables, layout, components, responsive)
├── chat.js      — Live support chat logic (polling, send, rate-limit countdown)
├── app.js       — Page router (showPage) & scroll-reveal animation
└── README.md
```

## Pages

| Route (pageName)          | Description                     |
|---------------------------|---------------------------------|
| `home`                    | Hero gallery, mission, process  |
| `shop`                    | Product grid                    |
| `product-pet-plant-stake` | Product detail view             |
| `contact`                 | Live support chat               |
| `privacy`                 | Privacy policy                  |
| `terms`                   | Terms of service                |

Navigation is handled client-side by `showPage()` in `app.js`.

## Chat Server

The live chat connects to a self-hosted backend. Update the server URL in **`chat.js`**:

```js
const CHAT_SERVER = "https://your-server-url-here";
```

The backend is expected to expose:
- `GET  /chat/my_ip` — returns `{ ip: "..." }`
- `GET  /chat/rate_status` — returns `{ can_send: bool, seconds_remaining: int }`
- `GET  /chat/get/me` — returns array of message objects
- `POST /chat/send` — body: `{ sender: "customer", message: "..." }`

## Fonts

Loaded from Google Fonts:
- **Dancing Script** — logo & decorative headings
- **Montserrat** — body text & nav
- **Playfair Display** — section headings & product copy

## Development

No build step required. Open `index.html` directly in a browser, or serve with any static file server:

```bash
npx serve .
# or
python3 -m http.server
```
