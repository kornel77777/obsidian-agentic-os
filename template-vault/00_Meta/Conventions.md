---
type: meta
status: active
---

# Conventions

The rules that keep the vault machine-readable.

## Frontmatter

```yaml
---
type: project | area | resource | literature | concept | daily | session | meta | video | transcript | brief
status: active | waiting | done | archived
---
```

| type | extra keys |
|---|---|
| `project` | `due` (YYYY-MM-DD), `priority` (`high` shows red in the HUD) |
| `concept` | `domain`, `origin` (where you met the idea) |
| `video` | `title`, `channel`, `url`, `published`, `duration`, `lang`, `watched`, `transcript` |
| `brief` | `date`, `window`, `lang`, `topics` |

Dates are always `YYYY-MM-DD`.

## Folders, frontmatter, links

- **Folders** say what a thing *is*.
- **Frontmatter** says what state it's *in* (queryable).
- **Links** say what it's *about* — be generous with `[[wikilinks]]`.

Every concept note ends with a **Connections** section.
