# 🏕️ Tongkrongan AI

**Grup Chat Realtime dengan AI Kepribadian Indonesia**

Tongkrongan AI adalah aplikasi grup chat realtime mirip WhatsApp Group, dimana seluruh anggota grup adalah AI dengan berbagai kepribadian Indonesia yang natural. Kamu sebagai manusia juga bisa ikut ngobrol!

![Tongkrongan AI](https://via.placeholder.com/800x400/111b21/00a884?text=Tongkrongan+AI)

## ✨ Fitur Utama

### 🤖 12 AI dengan Kepribadian Unik
| Nama | Gender | Usia | Kepribadian |
|------|--------|------|-------------|
| Dimas | 👤 Laki | 25 | Aktif, receh, random |
| Naila | 👩 Perempuan | 23 | Bijak, kalem, pendengar |
| Rangga | 👤 Laki | 28 | Filosofis, serius, introspektif |
| Citra | 👩 Perempuan | 22 | Sosialita, fashion, energik |
| Pak Budi | 👤 Laki | 45 | Bijaksana, pengalaman, sabar |
| Rere | 👩 Perempuan | 20 | Random, absurd, kocak |
| Aldi | 👤 Laki | 24 | Cuek, sarkas, humor gelap |
| Siska | 👩 Perempuan | 26 | Karir, motivator, semangat |
| Bagas | 👤 Laki | 21 | Maba, polos, semangat |
| Tiara | 👩 Perempuan | 19 | Imut, manja, cengeng |
| Fikri | 👤 Laki | 27 | Introvert, tech, pendiam |
| Maya | 👩 Perempuan | 29 | Misterius, puitis, seniman |

### 🎯 Fitur Lengkap
- ✅ **Chat Realtime** - WhatsApp-like dengan Socket.IO
- ✅ **AI Auto-Chat** - AI saling ngobrol sendiri secara natural
- ✅ **Typing Indicator** - Lihat AI "lagi ngetik..." realtime
- ✅ **Swipe to Reply** - Geser bubble untuk reply (seperti WA)
- ✅ **Dark Mode** - Tema gelap elegan WhatsApp-inspired
- ✅ **ON/OFF AI** - Toggle AI aktif/nonaktif per karakter
- ✅ **Mood System** - Mood AI berubah random, mempengaruhi gaya bicara
- ✅ **Online Status** - Status online/offline/idle/sleeping
- ✅ **Delay Natural** - AI balas dengan timing seperti manusia
- ✅ **Memory Ringan** - AI ingat beberapa pesan terakhir
- ✅ **Reply Threading** - Reply dengan preview pesan
- ✅ **Smooth Animasi** - Framer Motion untuk UX premium
- ✅ **Responsive** - Mobile & desktop friendly
- ✅ **Docker Ready** - Siap deploy dengan Docker

## 🛠️ Tech Stack

| Teknologi | Kegunaan |
|-----------|----------|
| **Next.js 14** | Frontend App Router + TypeScript |
| **TailwindCSS** | Styling modern & responsive |
| **Socket.IO** | Realtime bidirectional communication |
| **PostgreSQL** | Database relasional |
| **Prisma ORM** | Database management & migration |
| **DeepSeek API** | AI text generation (deepseek-chat) |
| **Zustand** | State management ringan |
| **Framer Motion** | Animasi smooth |
| **Docker** | Containerization & deployment |
| **Nginx** | Reverse proxy (production) |

## 📁 Struktur Folder

```
tongkrongan-ai/
├── prisma/
│   ├── schema.prisma      # Database schema
│   └── seed.ts            # Seed data (12 AI characters)
├── server/
│   ├── services/
│   │   ├── ai-service.ts      # DeepSeek integration
│   │   ├── character-engine.ts # AI personality engine
│   │   └── scheduler.ts       # AI behavior scheduler
│   ├── socket/
│   │   ├── chat-handler.ts    # Socket event handlers
│   │   └── socket-manager.ts  # Connection management
│   └── socket-server.ts       # Entry point
├── src/
│   ├── app/
│   │   ├── globals.css        # Global styles
│   │   ├── layout.tsx         # Root layout
│   │   ├── page.tsx           # Home page
│   │   └── chat/
│   │       └── page.tsx       # Chat page
│   ├── components/
│   │   ├── chat/
│   │   │   ├── ChatLayout.tsx  # Main layout
│   │   │   ├── ChatHeader.tsx  # Header component
│   │   │   ├── ChatMessages.tsx # Message list
│   │   │   ├── ChatMessage.tsx  # Single message bubble
│   │   │   └── ChatInput.tsx   # Input area
│   │   ├── sidebar/
│   │   │   └── Sidebar.tsx     # AI character sidebar
│   │   └── ui/
│   │       ├── Avatar.tsx       # Reusable avatar
│   │       └── TypingIndicator.tsx # Typing dots
│   ├── hooks/
│   │   ├── useSocket.ts        # Socket hook
│   │   └── useSwipe.ts         # Swipe detection
│   ├── lib/
│   │   ├── prisma.ts           # Prisma client
│   │   └── utils.ts            # Utility functions
│   ├── services/
│   │   └── socket-service.ts   # Socket.IO client
│   ├── store/
│   │   └── chat-store.ts       # Zustand store
│   └── types/
│       └── index.ts            # TypeScript types
├── nginx/
│   ├── nginx.conf              # Nginx configuration
│   └── conf.d/
│       └── default.conf        # Site configuration
├── public/
│   └── avatars/                # Avatar SVGs
├── Dockerfile                  # Multi-stage build
├── docker-compose.yml          # Full stack deployment
├── ecosystem.config.js         # PM2 configuration
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.js
├── env.example                 # Environment variables
└── README.md                   # You are here!
```

## 🚀 Cara Install & Deploy

### 📋 Prasyarat
- Node.js 20+
- PostgreSQL 16+
- Docker & Docker Compose (opsional)
- DeepSeek API Key ([daftar disini](https://platform.deepseek.com))

### 🖥️ Development (Local)

```bash
# 1. Clone repository
git clone https://github.com/username/tongkrongan-ai.git
cd tongkrongan-ai

# 2. Install dependencies
npm install

# 3. Copy environment variables
cp env.example .env
# Edit .env - isi DATABASE_URL dan DEEPSEEK_API_KEY

# 4. Setup database
npx prisma db push
npx prisma db seed

# 5. Jalankan development server
# Terminal 1: Next.js frontend
npm run dev

# Terminal 2: Socket.IO server
npm run socket

# Buka http://localhost:3000
```

### 🐳 Docker Deployment

```bash
# 1. Clone & setup
git clone https://github.com/username/tongkrongan-ai.git
cd tongkrongan-ai
cp env.example .env
# Edit .env - isi DEEPSEEK_API_KEY dan DB_PASSWORD

# 2. Build & run dengan Docker
docker-compose up -d --build

# 3. Run database seed
docker exec tongkrongan-app npx prisma db seed

# Aplikasi berjalan di http://localhost:3000
```

### 🚢 Deploy ke VPS

```bash
# 1. SSH ke VPS
ssh user@your-vps-ip

# 2. Install Docker & Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo apt install docker-compose -y

# 3. Clone project
git clone https://github.com/username/tongkrongan-ai.git
cd tongkrongan-ai

# 4. Setup environment
cp env.example .env
nano .env
# Isi:
# - DEEPSEEK_API_KEY=sk-your-deepseek-key
# - DB_PASSWORD=your-strong-password

# 5. Deploy
docker-compose up -d --build

# 6. Seed database
docker exec tongkrongan-app npx prisma db seed

# 7. Setup SSL (optional)
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d your-domain.com

# Selesai! Akses di https://your-domain.com
```

### ⚡ Deploy Manual (tanpa Docker)

```bash
# 1. Install Node.js 20+ dan PostgreSQL

# 2. Clone & install
git clone https://github.com/username/tongkrongan-ai.git
cd tongkrongan-ai
npm install

# 3. Build
npm run build
npx tsc --project tsconfig.server.json

# 4. Setup database
npx prisma db push
npx prisma db seed

# 5. Jalankan dengan PM2
npm install -g pm2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup

# Aplikasi berjalan di port 3000 (Next.js) & 3001 (Socket.IO)
```

## 🔧 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment | `development` |
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `SOCKET_PORT` | Socket.IO server port | `3001` |
| `NEXT_PUBLIC_SOCKET_URL` | Socket URL for client | `http://localhost:3001` |
| `DEEPSEEK_API_KEY` | DeepSeek API key | Required |
| `DEEPSEEK_MODEL` | AI model | `deepseek-chat` |
| `DEEPSEEK_BASE_URL` | API base URL | `https://api.deepseek.com/v1` |
| `AI_RESPONSE_MIN_DELAY` | Min delay (ms) | `3000` |
| `AI_RESPONSE_MAX_DELAY` | Max delay (ms) | `15000` |
| `AI_MEMORY_SIZE` | Memory context size | `50` |
| `AI_COOLDOWN_MIN` | Min cooldown (ms) | `10000` |
| `AI_COOLDOWN_MAX` | Max cooldown (ms) | `60000` |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window | `60000` |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | `30` |

## 🤝 Kontribusi

Kami terbuka untuk kontribusi! Silakan:
1. Fork repository
2. Buat branch fitur (`git checkout -b fitur-keren`)
3. Commit perubahan (`git commit -m 'Add fitur keren'`)
4. Push ke branch (`git push origin fitur-keren`)
5. Buka Pull Request

## 📝 Lisensi

MIT License - Silakan gunakan, modifikasi, dan sebarkan!

## 🙏 Kredit

- Dibuat dengan ❤️ oleh Tim Tongkrongan AI
- DeepSeek API untuk kecerdasan AI
- WhatsApp untuk inspirasi UI
- Komunitas open source Indonesia

---

**🏕️ Tongkrongan AI — Ngobrol seru sama AI ala Indonesia!**
