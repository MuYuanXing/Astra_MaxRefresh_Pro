# Astra_MaxRefresh_Pro

> **Warning**:
>
>   1. Before doing anything, make sure you are capable of recovering from a brick.
>   2. Upgrading from the old version (Astra Engine): uninstall the old module first, then flash this one. They are different modules and their configs are not shared.
>

## Introduction

Astra_MaxRefresh_Pro is a high-refresh-rate module built specifically for Oplus (OnePlus / OPPO / Realme) devices. It supports native refresh rates and overclocked DTBO tiers, and can force-lock the refresh rate you want. Whether on native or overclocked setups, it delivers stable and efficient display refresh control.

## Features

### Refresh Rate Locking

  * Supports native refresh rates: 60Hz, 90Hz, 120Hz, etc.
  * Supports overclocked DTBO: customize refresh rate tiers as needed
  * Force-locks a chosen tier, preventing the system from auto-downclocking or switching
  * Supports per-app automatic tier switching with an adjustable polling interval

### WebUI Manager

  * Liquid glass visual design; light / dark / follow-system themes
  * Selectable animation level (high / medium / low) for different performance devices
  * Edge-to-edge layout, native support for the status bar and gesture navigation bar

### Overclocked DTBO Compatibility

  * Automatically detects all available refresh rate tiers after flashing
  * The 120Hz tier **must** be retained in the overclocked DTBO, otherwise functionality may fail or become unstable
  * If the custom per-app switching feature does not work, contact the author who provided that DTBO first and update to the latest version

## Usage

  1. Download and flash the Astra_MaxRefresh_Pro module (KernelSU, or Magisk + KsuWebUI).
  2. Reboot the device; all available refresh rate tiers will be detected automatically.
  3. Open the WebUI, go to the **Settings** page and run **Full Scan** first.
  4. Configure tier attributes: mark non-native tiers as **Overclock**, select at least one **Native Baseline** per resolution, fill in the switching order for all overclocked tiers, then save.
  5. On the **Home** page, select a global tier and save — or add per-app tier rules on the **Apps** page.

## FAQ

### Cannot switch to a higher tier after lock screen or reboot

  * On some devices, the overclocked DTBO cannot jump directly to a higher tier after lock screen or reboot; native users automatically restore their previously set tier within a few seconds of rebooting.
  * It is recommended to update the overclocked DTBO to the latest version.

### Recommended Manager

  * KernelSU and its forks give the best experience.
  * Magisk users must install KsuWebUI and grant it root permission before use.

* * *

See CHANGELOG.md for the changelog.
