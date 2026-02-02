# Titan Documentation Style Guide

**Voice:** Professional, direct, and active. "Configure the bot" instead of "The bot should be configured."
**Tense:** Present tense. "The system runs..." (not "will run").
**Audience:** Operators and Engineers. Assume competence but not context.

## Formatting Standards

### Headings
Use Sentence case.
```markdown
# Good: How to deploy
# Bad: How To Deploy
```

### Code Blocks
Always specify the language.
```bash
npm run start:brain
```

### Admonitions
Use GitHub-style alerts.
> [!NOTE]
> Useful context.

> [!WARNING]
> Critical warnings.

### Links
- Use relative links: `[Start Here](START_HERE.md)`
- Do not use absolute paths.

## Anti-Patterns
- "Please": Just give the instruction.
- "Simply": Nothing is simple.
- Future tense: "This feature will be..." (unless it's a roadmap doc).
