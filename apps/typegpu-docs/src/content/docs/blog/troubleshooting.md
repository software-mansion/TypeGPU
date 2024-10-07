---
title: How to enable WebGPU on your device
date: 2024-10-04
tags:
  - Safari
  - iPhone
  - Troubleshooting
  - macOS
  - WebGPU support
  - Deno
authors:
  - name: Konrad
    title: TypeGPU developer
    picture: https://avatars.githubusercontent.com/u/66403540?s=200
excerpt: Since WebGPU is still considered experimental, despite being supported by many browsers, it is often hidden behind flags. This post will help you find out if your browser supports WebGPU and help you enable it if needed.
cover:
  alt: A sausage dog
  image: ../../../assets/troubleshooting_thumbnail.png
---

Since WebGPU is still considered experimental, despite being supported by
many browsers, it is often hidden behind flags.
This post will help you find out if your browser supports WebGPU
and help you enable it if needed.
In general, you can check if your browser supports WebGPU by visiting [the WebGPU API doccumentation](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API#browser_compatibility)
and looking for your browser in the list. If it is listed under `full support` it should generally work out of the box (on the listed operating systems).
There are some cases when it is more complicated and requires some manual configuration.
This post will guide you through the process of enabling WebGPU on your devices.

## Safari on iOS
Despite what the [docs](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API#browser_compatibility)
tell us, there is a way to enable WebGPU in Safari on iOS.

To enable WebGPU go to:
```
Settings > Safari > Advanced > Feature Flags
```
And then enable WebGPU.
That's it! After enabling the WebGPU flag you can go to [our examples page](https://docs.swmansion.com/TypeGPU/examples/)
and you should be able to tinker with them on your phone.

## Safari on macOS

Go to:
```
Settings > Advanced
```
And check the `Show features for web developers` checkbox.
After that, you can go to:
```
Settings > Feature Flags
```
And search for the WebGPU checkbox.
Enable it and you should be good to go!

## Deno

If you are running Deno 1.39 or newer you can either:
- Run your script with the `--unstable-webgpu` flag
- Add the following line to your `deno.json` file:
```json
"unstable": [
  "webgpu"
]
```
