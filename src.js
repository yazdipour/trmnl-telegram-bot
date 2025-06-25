import telegram_bot_api from "@pipedream/telegram_bot_api";
import { axios } from "@pipedream/platform";

// API configuration
const TELEGRAM_API_BASE = "https://api.telegram.org";
const TRMNL_API_BASE = "https://usetrmnl.com/api";

export default defineComponent({
  name: "Send Telegram Image to TRMNL",
  description: "Extract an image from a Telegram message and send it to TRMNL using a plugin UUID",
  type: "action",
  props: {
    telegram_bot_api,
    message: {
      type: "object",
      label: "Telegram Message",
      description: "The Telegram message object containing the image and caption",
    },
    plugin_url: {
      type: "string",
      label: "TRMNL Plugin UUID",
      description: "Paste your TRMNL plugin UUID (e.g. xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)",
    },
    filter_user_id: {
      type: "integer",
      label: "Filter User ID",
      description: "Optional. If set, only the user with this ID can use the bot. Leave empty to allow all users.",
      optional: true,
    },
  },

  methods: {
    // Permission validation
    validateUserPermission() {
      if (this.filter_user_id && this.message.from.id !== this.filter_user_id) {
        throw new Error("You don't have permission to use this bot.");
      }
    },

    // Extract photo information from message
    getPhotoInfo($) {
      const photos = this.message.photo;
      if (!photos?.length) {
        throw new Error("No photo found in the message.");
      }
      // Get the highest quality photo (last in array)
      return photos[photos.length - 1];
    },

    // Generate full image URL from Telegram
    async generateImageUrl($, photo) {
      const fileInfo = await axios($, {
        url: `${TELEGRAM_API_BASE}/bot${this.telegram_bot_api.$auth.token}/getFile`,
        method: "GET",
        params: { file_id: photo.file_id },
      });

      const filePath = fileInfo.result?.file_path;
      if (!filePath) {
        throw new Error("Can't find the file path from Telegram.");
      }

      return `${TELEGRAM_API_BASE}/file/bot${this.telegram_bot_api.$auth.token}/${filePath}`.trim();
    },

    // Parse caption for CSS classes and styles
    parseCaption() {
      const caption = this.message.caption || "";
      const words = caption.trim().split(/\s+/);

      return {
        imgClass: words
          .filter(word => word.startsWith("."))
          .map(word => word.slice(1))
          .join(" "),
        imgStyle: words
          .filter(word => !word.startsWith("."))
          .join(" "),
      };
    },

    // Send image data to TRMNL
    async sendToTrmnl($, { imageUrl, imgClass, imgStyle }) {
      const payload = {
        merge_variables: {
          img_url: imageUrl,
          ...(imgClass && { img_class: imgClass }),
          ...(imgStyle && { img_style: imgStyle }),
        },
      };

      const response = await axios($, {
        method: "POST",
        url: `${TRMNL_API_BASE}/custom_plugins/${this.plugin_url}`,
        headers: { "Content-Type": "application/json" },
        data: payload,
      });

      console.log("📤 Payload Sent to TRMNL:", payload);
      console.log("📥 TRMNL Response:", response);

      return { response, payload };
    },
  },

  async run({ $ }) {
    try {
      this.validateUserPermission();
      const photoInfo = await this.getPhotoInfo($);
      const imageUrl = await this.generateImageUrl($, photoInfo);
      const { imgClass, imgStyle } = this.parseCaption();
      const { response, payload } = await this.sendToTrmnl($, { imageUrl, imgClass, imgStyle });

      $.export("$summary", "✅ Image sent to TRMNL successfully.");
      return {
        success: true,
        sent_payload: payload,
        response_from_trmnl: response,
      };
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message;
      $.export("$summary", `❌ Error: ${errorMessage}`);
      return {
        success: true, // Keep this true so the workflow continues
        error: {
          message: errorMessage,
          timestamp: new Date().toISOString()
        },
        shouldNotify: true // Flag to indicate this needs error notification
      };
    }
  },
});
