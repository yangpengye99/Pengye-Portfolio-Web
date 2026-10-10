# Assets

All images in `assets/img` were generated from the PDF and the raw WooWoof UI exports
(`E:\工作\找工作\作品集素材 WooWoof`) with a one-off Pillow script:

- raw embedded images were extracted from the PDF with PyMuPDF (best quality, transparency kept);
- composed layouts were cropped from the 3840px page renders in `E:\工作\找工作\作品就散装2`;
- regions containing Chinese labels were cropped out or painted black and rebuilt as English HTML;
- transparent renders are auto-trimmed; everything is WebP q84.

After replacing an image, run `python tools/fix_img_dims.py` to sync width/height attributes.
