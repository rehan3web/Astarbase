# Studio styles

Sorabase Studio uses Tailwind CSS for component styling. Prefer existing theme tokens and utility classes to keep light and dark modes consistent.

## Guidelines

- Keep styles close to the component whenever Tailwind utilities are sufficient.
- Use custom stylesheets for third-party integration overrides or styles that utilities cannot express clearly.
- Group overrides by the component or integration they affect.
- Preserve visible keyboard focus, readable contrast, and existing responsive behavior.
- Avoid global overrides that unintentionally change dialogs, dropdowns, tables, or the SQL editor.

For setup and frontend checks, see the [frontend guide](../README.md). For installation and architecture, see the [main project README](../../README.md).
