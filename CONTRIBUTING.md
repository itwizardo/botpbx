# Contributing to BotPBX

Thank you for your interest in contributing to BotPBX! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Ways to Contribute](#ways-to-contribute)
- [Development Setup](#development-setup)
- [Project Architecture](#project-architecture)
- [Making Changes](#making-changes)
- [Pull Request Process](#pull-request-process)
- [Code Style](#code-style)
- [Testing](#testing)
- [Areas Needing Help](#areas-needing-help)

---

## Code of Conduct

Be respectful, inclusive, and constructive. We're building something together.

- Be welcoming to newcomers
- Be patient with questions
- Focus on what's best for the community
- Show empathy towards other community members

---

## Ways to Contribute

### Report Bugs

Found a bug? [Open an issue](https://github.com/itwizardo/botpbx/issues/new?template=bug_report.md) with:
- Clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, Node version, etc.)

### Suggest Features

Have an idea? [Start a discussion](https://github.com/itwizardo/botpbx/discussions/new?category=ideas) with:
- Clear description of the feature
- Use case / problem it solves
- Any implementation ideas

### Improve Documentation

Documentation PRs are always welcome:
- Fix typos or unclear explanations
- Add examples
- Improve API documentation
- Translate to other languages

### Submit Code

Ready to code? Look for issues labeled:
- `good first issue` - Great for newcomers
- `help wanted` - We'd love community help
- `bug` - Fix something broken
- `enhancement` - Add new features

---

## Development Setup

### Prerequisites

- **Node.js 23+** - JavaScript runtime
- **PostgreSQL 15+** - Database
- **Asterisk 22** - PBX engine (optional for UI-only development)
- **npm** - Package manager

### Quick Start

```bash
# Clone the repository
git clone https://github.com/itwizardo/botpbx.git
cd botpbx

# Install backend dependencies
npm install

# Install frontend dependencies
cd web-admin
npm install
cd ..

# Copy environment template
cp .env.example .env

# Edit .env with your settings
# At minimum, set:
# - DATABASE_URL
# - JWT_SECRET
# - ASTERISK_AMI_* (if testing with Asterisk)

# Run database migrations
npm run migrate

# Start development servers
npm run dev          # Backend on port 3000
cd web-admin && npm run dev  # Frontend on port 3001
```

### Environment Variables

Key variables to configure:

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `JWT_SECRET` | Secret for JWT signing | Yes |
| `API_PORT` | Backend API port (default: 3000) | No |
| `ASTERISK_AMI_HOST` | Asterisk AMI host | For telephony |
| `ASTERISK_AMI_PORT` | Asterisk AMI port (default: 5038) | For telephony |
| `ASTERISK_AMI_USER` | AMI username | For telephony |
| `ASTERISK_AMI_SECRET` | AMI password | For telephony |
| `OPENAI_API_KEY` | OpenAI API key | For AI features |
| `ANTHROPIC_API_KEY` | Anthropic API key | For AI features |
| `DEEPGRAM_API_KEY` | Deepgram API key | For transcription |

See `.env.example` for the complete list.

---

## Project Architecture

```
botpbx/
├── src/                          # Backend (Node.js/TypeScript)
│   ├── index.ts                  # Entry point
│   ├── api/
│   │   ├── server.ts             # Fastify server setup
│   │   ├── websocket.ts          # WebSocket manager
│   │   └── routes/               # API endpoints (33+ files)
│   │       ├── extensions.ts     # Extension CRUD
│   │       ├── queues.ts         # Queue management
│   │       ├── aiAgentsFastify.ts# AI agents
│   │       └── ...
│   │
│   ├── ai/                       # AI integration
│   │   ├── conversationEngine.ts # AI conversation orchestration
│   │   ├── llm/                  # LLM providers
│   │   │   ├── anthropicProvider.ts  # Claude
│   │   │   ├── openaiProvider.ts     # GPT
│   │   │   └── groqProvider.ts       # Groq
│   │   ├── stt/                  # Speech-to-text providers
│   │   │   ├── deepgramProvider.ts
│   │   │   ├── whisperProvider.ts
│   │   │   └── assemblyaiProvider.ts
│   │   └── functions/            # AI function calling
│   │       └── builtins/         # Transfer, SMS, callbacks
│   │
│   ├── asterisk/                 # Asterisk integration
│   │   ├── amiClient.ts          # AMI connection
│   │   ├── agiServer.ts          # AGI server (inbound calls)
│   │   ├── audioSocketServer.ts  # Realtime audio streaming
│   │   └── ivrController.ts      # IVR execution
│   │
│   ├── services/                 # Business logic (20+ files)
│   │   ├── ttsService.ts         # Multi-provider TTS
│   │   ├── dialerService.ts      # Campaign dialing
│   │   ├── transcriptionService.ts
│   │   └── ...
│   │
│   ├── db/
│   │   ├── database.ts           # PostgreSQL connection
│   │   ├── migrations.ts         # Schema migrations
│   │   └── repositories/         # Data access (27 files)
│   │       ├── extensionRepository.ts
│   │       ├── queueRepository.ts
│   │       └── ...
│   │
│   └── utils/                    # Utilities
│       ├── config.ts             # Configuration
│       └── logger.ts             # Logging
│
├── web-admin/                    # Frontend (Next.js/React)
│   ├── src/
│   │   ├── app/                  # Pages (file-based routing)
│   │   │   ├── (dashboard)/
│   │   │   │   ├── extensions/   # Extensions UI
│   │   │   │   ├── queues/       # Queues UI
│   │   │   │   ├── ai-agents/    # AI agents UI
│   │   │   │   ├── ivr/          # IVR builder
│   │   │   │   └── ...
│   │   │   └── (auth)/
│   │   │       └── login/
│   │   ├── components/           # Reusable UI components
│   │   ├── stores/               # State management
│   │   ├── hooks/                # Custom React hooks
│   │   └── lib/                  # Utilities
│   │
│   └── public/                   # Static assets
│
└── config/                       # Configuration files
```

### Key Concepts

**API Routes** (`src/api/routes/`)
- Each file handles one resource (extensions, queues, etc.)
- Uses Fastify with TypeScript
- JWT authentication via middleware

**Repositories** (`src/db/repositories/`)
- Data access layer for PostgreSQL
- One repository per entity
- Uses raw SQL with parameterized queries

**Services** (`src/services/`)
- Business logic layer
- Orchestrates repositories and external providers
- Example: `ttsService.ts` handles 7 TTS providers

**AI Providers** (`src/ai/`)
- Pluggable LLM, TTS, STT providers
- Each provider implements a common interface
- Easy to add new providers

---

## Making Changes

### Branch Naming

Use descriptive branch names:
- `feature/add-new-tts-provider`
- `fix/queue-position-announcement`
- `docs/improve-api-reference`

### Commit Messages

Write clear commit messages:
```
feat: add PlayHT TTS provider

- Implement PlayHT API integration
- Add voice selection UI
- Update TTS service to support PlayHT
```

Prefixes:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `refactor:` - Code refactoring
- `test:` - Tests
- `chore:` - Maintenance

---

## Pull Request Process

1. **Create a branch** from `main`
2. **Make your changes** with clear commits
3. **Test locally** - ensure nothing breaks
4. **Update documentation** if needed
5. **Open a PR** with:
   - Clear title and description
   - Link to related issue (if any)
   - Screenshots for UI changes
6. **Address feedback** from reviewers
7. **Merge** once approved

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation
- [ ] Refactoring

## Testing
How was this tested?

## Screenshots (if applicable)

## Related Issues
Fixes #123
```

---

## Code Style

### TypeScript

- Use TypeScript for all new code
- Define types/interfaces for data structures
- Avoid `any` - use proper types

### Backend

```typescript
// Good
interface Extension {
  id: string;
  number: string;
  name: string;
  voicemailEnabled: boolean;
}

async function getExtension(id: string): Promise<Extension | null> {
  // implementation
}

// Avoid
async function getExtension(id: any): Promise<any> {
  // implementation
}
```

### Frontend

- Use functional components with hooks
- Keep components small and focused
- Use Tailwind CSS for styling

```tsx
// Good
function ExtensionCard({ extension }: { extension: Extension }) {
  return (
    <div className="p-4 border rounded-lg">
      <h3 className="font-semibold">{extension.name}</h3>
      <p className="text-gray-600">{extension.number}</p>
    </div>
  );
}
```

### Formatting

- Use 2-space indentation
- Use single quotes for strings
- No trailing commas
- Run `npm run lint` before committing

---

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- src/services/ttsService.test.ts

# Run with coverage
npm run test:coverage
```

### Writing Tests

- Test business logic in services
- Test API endpoints
- Mock external services (LLM, TTS, STT providers)

```typescript
describe('TtsService', () => {
  it('should generate audio with Piper', async () => {
    const audio = await ttsService.generate('Hello world', 'piper');
    expect(audio).toBeInstanceOf(Buffer);
  });
});
```

---

## Areas Needing Help

We especially welcome contributions in these areas:

### Documentation
- API reference improvements
- Tutorials and guides
- Video walkthroughs

### New Providers
- Additional TTS providers
- Additional STT providers
- New LLM integrations

### Testing
- Unit tests for services
- Integration tests for API
- E2E tests for frontend

### UI/UX
- Accessibility improvements
- Mobile responsiveness
- Dark mode enhancements

### Internationalization
- UI translations
- Documentation translations

### Performance
- Query optimization
- Caching strategies
- WebSocket efficiency

---

## Getting Help

- **Discord**: [Join our server](https://discord.gg/botpbx) for real-time help
- **Discussions**: [GitHub Discussions](https://github.com/itwizardo/botpbx/discussions) for longer questions
- **Issues**: [GitHub Issues](https://github.com/itwizardo/botpbx/issues) for bugs and features

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to BotPBX!
