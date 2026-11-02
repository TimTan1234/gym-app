import { z } from "zod";

const MAX_IMAGE_CHARS = 2_800_000; // ~2 MB binary as base64

/** A photo as the AI routes accept it: a resized JPEG/PNG/WebP data URL. Messages are message keys. */
export const ImageSchema = z
  .string()
  .max(MAX_IMAGE_CHARS, "imageTooLarge")
  .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "imageFormat");
