# Image Integration Testing Playbook

- Use only base64-encoded JPEG, PNG, or WEBP images in scanner requests.
- Images must contain real visual features such as leaves, edges, texture, or shadows.
- Do not use SVG, BMP, HEIC, blank, solid-color, or uniform-variance images.
- Keep test image payloads reasonably sized; transcode and re-detect MIME after any transformation.
- Validate that crop analysis receives the base64 payload on the backend and returns a diagnosis response.