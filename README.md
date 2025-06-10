# code-zippy

Convert a code folder to something you can feed a LLM

To **develop locally** in your `code-zippy` project **and** eventually use it as a **globally installed CLI tool**.

### ✅ Develop Locally Using `npm link`

While developing, use:

```bash
npm link
```

Check if it works

```bash
npm list -g
```

This:

- Creates a global symlink to your current package folder.
- Lets you call `code-zippy` from the command line, as if it were globally installed.
- Automatically uses your latest local code — no need to reinstall each time.

To unlink:

```bash
npm unlink -g code-zippy
```

---

### ✅ Prepare for Global Installation

Once ready to publish or distribute:

```bash
npm pack  # creates a .tgz package
npm publish  # if you're publishing to npm
```

Or others can install it globally via:

```bash
npm install -g /path/to/code-zippy
```

Or if it's in a git repo:

```bash
npm install -g git+https://github.com/MatthijsKamstra/code-zippy.git
```

### ✅ Ignore Build Output During Dev

Your `.code-zippy-ignore` includes:

```
node_modules
.git
dist
build
.vscode
```

This is good — it avoids zipping the dev clutter.

---

### Workflow

| Goal                       | Command                       |
| -------------------------- | ----------------------------- |
| Local dev w/ global usage  | `npm link`                    |
| Undo link                  | `npm unlink -g code-zippy`    |
| Install globally elsewhere | `npm install -g ./code-zippy` |
| Prepare for npm publish    | `npm pack` or `npm publish`   |
| Run CLI                    | `code-zippy ./my-folder`      |
