# FOCUS — Stay on task. Really.

FOCUS is a browser extension built for students, remote workers, and anyone who has ever opened Twitter "just for a second" and come back 45 minutes later. It watches what tabs you open while you work and gently (or firmly) redirects you when you drift. No subscriptions. No accounts. No data leaving your computer. Everything runs locally.

---

## Why this exists

Most productivity tools work like bouncers — they give you a list of blocked sites and lock the door. That works until you need to look something up on Reddit for a coding question, or check YouTube for a tutorial. Suddenly your own tool is fighting you.

FOCUS takes a different approach. Instead of a static blocklist, it learns what "on task" means based on what you actually tell it you're working on. Going through a Coursera Python course? Stack Overflow gets a pass. Watching gaming videos on YouTube while trying to write an essay? Blocked. Same site, different context, different decision.

That intelligence comes from a small on-device machine learning model trained specifically for this kind of browser behavior. No cloud, no phone-home, no surveillance. Your sessions stay on your machine.

---

## What it does

You open the extension, type what you're working on (like "finish the economics essay" or "build the login page"), paste the link where you'll be working, and hit Start. From that moment:

- Every tab you switch to gets scored. The model looks at the page title, the domain, and how much it relates to your stated task.
- If you land somewhere distracting, the page gets replaced with a blocked screen. You'll see a 10-second countdown, the name of the site you were heading to, and a confidence score showing how sure the system is that it's a distraction.
- You can override the block if you have a reason — but each override burns one of your allowed distractions for the session.
- When you stop the session, you get a focus score and a short recap.

---

## The features

**Smart detection, not a static blocklist**
The model uses TF-IDF relevance, domain matching, keyword overlap, and learned weights to decide if a site is related to your task. Same domain can be allowed or blocked depending on what you said you're working on.

**Strict mode**
When you really need to lock in, flip strict mode on. There are no overrides. The countdown runs and takes you back — full stop.

**Distraction budget**
Rather than strict mode, you can say "I'm allowed 3 distractions this session." Each override uses one. When you hit zero, the extension treats you as if strict mode is on for the rest of the session.

**Scheduled start**
Set a delay and the session starts automatically. Good for if you want to make coffee first or get settled before the timer kicks in.

**Session history and streaks**
Every session you complete gets saved as a summary — task name, how long, how many blocks, what your focus score was. Sessions build a streak if you complete one every day. The dashboard shows your last 7 days as a bar chart, your recent sessions with letter grades (S / A / B / C), and which domains distracted you most.

**Live decision log**
Inside the popup while a session is running, you can see the last five tab switches — each one showing the domain and whether it was allowed or blocked, along with the model's confidence percentage.

**Privacy by design**
Nothing is sent anywhere. All storage is `chrome.storage.local`. The ML model runs entirely in the browser using weights bundled with the extension. There is no backend, no analytics server, no login.

---

## How to install it (developer mode)

Chrome Web Store submission is pending. In the meantime:

1. Download or clone this repo.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** (top right toggle).
4. Click **Load unpacked** and select the `extension/` folder.
5. The FOCUS icon will appear in your toolbar. Click it to start your first session.

Firefox users: the `browser_specific_settings` in `manifest.json` is already set up. Load via `about:debugging` → This Firefox → Load Temporary Add-on.

---

## Project structure

```
focusflow/
├── extension/
│   ├── manifest.json          # Extension config (MV3)
│   ├── background.js          # Service worker — session logic, ML inference, tab blocking
│   ├── blocked.html/js        # Distraction redirect page with countdown
│   ├── onboarding.html/js     # First-install welcome screen
│   ├── dashboard.html/js      # Full analytics page
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.css
│   │   └── popup.js
│   ├── ml/
│   │   ├── classifier.js      # Feature extraction + logistic regression inference
│   │   ├── tfidf.js           # TF-IDF cosine similarity
│   │   └── weights.json       # Trained model weights (bundled, local)
│   └── icons/
├── ml_pipeline/
│   ├── feature_engineering.py # Feature extraction + synthetic training data
│   └── train.py               # Model training script (outputs weights.json)
├── privacy-policy.html        # Standalone privacy policy page
├── store-listing.md           # Chrome Web Store copy
└── generate-icons.html        # In-browser icon generator tool
```

---

## The ML model

The model is a logistic regression classifier trained on synthetic task/tab pairs covering eight task categories — writing essays, coding, watching lectures, doing research, math, reading, job applications, and language learning. It reaches 93.75% test accuracy with zero false positives on the test set.

Five features go into every decision:

| Feature | What it measures |
|---|---|
| TF-IDF relevance | How much the page title overlaps with your task description |
| Domain match | Whether the tab domain appears in your task text |
| Known distraction | Whether the domain is on a hardcoded list (Instagram, TikTok, Twitter, etc.) |
| Keyword overlap | Shared keywords between task and page title |
| Domain in task | Direct string match between domain and task words |

Hard rules fire first — the domain you gave as your work URL is always allowed, and known social/entertainment platforms are always blocked regardless of what the model says. The model handles the grey zone.

Training happens in `ml_pipeline/train.py`. Running it regenerates `weights.json`. No external ML libraries needed at inference time — the extension does everything with plain JavaScript math.

---

## Roadmap

- Chrome Web Store public listing
- Pomodoro timer integration
- Export session history to CSV
- Custom distraction domain lists
- Mobile browser support (Firefox for Android is already close)

---

## Who built this

Built by Aubert Bihibindi as a capstone project at ALU (African Leadership University), exploring how on-device machine learning can make productivity tools smarter and more private.

---

## License

MIT — do whatever you want with it, just don't sell it back to people as a subscription SaaS and call it innovation.
