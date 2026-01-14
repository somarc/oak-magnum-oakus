# 🌳 The Magnum OAKus

> **Production-grade recovery procedures for Apache Oak SegmentStore (TarMK)**

[![Deploy to GitHub Pages](https://github.com/somarc/oak-magnum-oakus/actions/workflows/deploy.yml/badge.svg)](https://github.com/somarc/oak-magnum-oakus/actions/workflows/deploy.yml)

**📖 Live Documentation: [somarc.github.io/oak-magnum-oakus](https://somarc.github.io/oak-magnum-oakus/)**

---

## What is The Magnum OAKus?

The definitive guide to Apache Oak repository maintenance, corruption recovery, and operational excellence. This documentation covers:

- 🚨 **Crisis Response** - Checkbox-driven checklists for emergency situations
- 🏗️ **Architecture** - Deep dive into segments, TAR files, journal, and generational GC
- 🛠️ **Recovery Operations** - Step-by-step guides for `oak-run` commands
- 📋 **Checkpoints** - Understanding and managing Oak checkpoints
- 💾 **DataStore** - Consistency checks and garbage collection
- 📚 **Reference** - Complete command reference and troubleshooting

## Why "Magnum OAKus"?

Because when your AEM repository is corrupted at 3 AM and the business is screaming, you need a **magnum opus** of Oak knowledge - not scattered Stack Overflow answers.

This is the guide we wish existed when we first faced repository corruption.

## Quick Start

### 🚨 In Crisis?

1. **STOP** - Don't run any commands yet
2. **READ** - [Crisis Checklist](https://somarc.github.io/oak-magnum-oakus/crisis/)
3. **IDENTIFY** - What type of repository do you have?
4. **DIAGNOSE** - Run `oak-run check` first
5. **RECOVER** - Follow the decision tree

### Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```

## Architecture

Built with [VitePress](https://vitepress.dev/) featuring:

- 🌲 **Forest Dark Theme** - Easy on the eyes during those late-night recovery sessions
- 📊 **Interactive Diagrams** - Mermaid charts and custom Vue components
- 🔍 **Full-text Search** - Find what you need fast
- 📱 **Responsive** - Works on mobile (because emergencies don't wait for your desk)

## Related Projects

- [Oak Chain](https://somarc.github.io/oak-chain-docs/) - Blockchain-native content repository
- [Apache Jackrabbit Oak](https://jackrabbit.apache.org/oak/) - The foundation

## Contributing

Found an error? Have a recovery tip to share? PRs welcome!

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/amazing-tip`)
3. Commit your changes (`git commit -m 'Add amazing recovery tip'`)
4. Push to the branch (`git push origin feature/amazing-tip`)
5. Open a Pull Request

## License

Apache 2.0 - Same as Apache Oak

---

**🌳 Oak: The foundation of enterprise content**

*Built with frustration, validated in production, shared with love.*
