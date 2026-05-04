# Core dev tools PATH (must be first — mise, pnpm, and others live here)
export PATH="$HOME/.local/bin:$PATH"

# Homebrew (Apple Silicon)
if [ -x /opt/homebrew/bin/brew ]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
fi

# pnpm
export PNPM_HOME="/Users/cheng/Library/pnpm"
case ":$PATH:" in
  *":$PNPM_HOME:"*) ;;
  *) export PATH="$PNPM_HOME:$PATH" ;;
esac
# pnpm end

# mise (macOS universal package manager)
eval "$(mise activate zsh)"
# Ensure mise env is populated immediately (fixes non-interactive shells / doctor checks)
eval "$(mise hook-env -s zsh 2>/dev/null)"

# Local dev tools fallback (shims, gems)
case ":$PATH:" in
  *":$HOME/.local/share/mise/shims:"*) ;;
  *) export PATH="$HOME/.local/share/mise/shims:$HOME/.gem/ruby/3.4.0/bin:$PATH" ;;
esac

# Android SDK
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
case ":$PATH:" in
  *":$ANDROID_HOME/platform-tools:"*) ;;
  *) export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH" ;;
esac

# Java for Android builds
export JAVA_HOME="$HOME/.local/share/mise/installs/java/17.0.2"

# opencode
export PATH=/Users/cheng/.opencode/bin:$PATH

# bun completions
[ -s "/Users/cheng/.bun/_bun" ] && source "/Users/cheng/.bun/_bun"

# bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# npm global bin (for omk doctor and global packages)
export PATH="/Users/cheng/.local/share/mise/installs/node/24.15.0/bin:$PATH"

# >>> omk shell integration
export OMK_STAR_PROMPT=1
export OMK_RENDER_LOGO=1
export OMK_PROJECT_ROOT="$HOME"
# <<< end omk shell integration
