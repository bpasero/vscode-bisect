# vscode-bisect
Allows to bisect released VSCode web and desktop insider builds for issues similar to what `git bisect` does.

## Requirements

- [Node.js](https://nodejs.org/en/) at least `16.x.x`

## Usage

Install vscode-bisect globally:

```sh
npm install -g vscode-bisect
```

Verify the installation:

```sh
vscode-bisect --help
```

`vscode-bisect` is meant to be only used as a command line tool.
