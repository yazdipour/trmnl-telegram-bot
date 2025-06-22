import telegram_bot_api from "@pipedream/telegram_bot_api";
import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Send Telegram Image to TRMNL",
  description:
    "Extract an image from a Telegram message and send it to TRMNL in a merge_variables payload",
  type: "action",
  props: {
    telegram_bot_api,
    message: {
      type: "object",
      label: "Telegram Message",
      description:
        "The Telegram message object containing the image and caption",
    },
  },

  async run({ $ }) {
    const API_ENDPOINT =
      "https://usetrmnl.com/api/custom_plugins/de09e52a-095e-4c5c-b697-eb6b1aef11d2";

    const photos = this.message.photo;
    if (!photos || photos.length === 0) {
      throw new Error("No photo found in the message.");
    }

    const photo = photos[photos.length - 1];
    const fileInfo = await axios($, {
      url: `https://api.telegram.org/bot${this.telegram_bot_api.$auth.token}/getFile`,
      method: "GET",
      params: { file_id: photo.file_id },
    });
    const filePath = fileInfo.result.file_path;
    console.log(fileInfo);
    if (filePath === undefined) {
      throw new Error("Can't find the file!");
    }
    const img_url =
      `https://api.telegram.org/file/bot${this.telegram_bot_api.$auth.token}/${filePath}`.trim();

    const caption = this.message.caption || "";
    const words = caption.trim().split(/\s+/);
    const img_class = words
      .filter((w) => w.startsWith("."))
      .map((w) => w.slice(1))
      .join(" ");
    const img_style = words.filter((w) => !w.startsWith(".")).join(" ");

    const payload = {
      merge_variables: {
        img_url,
        ...(img_class && { img_class }),
        ...(img_style && { img_style }),
      },
    };

    try {
      const response = await axios($, {
        method: "POST",
        url: API_ENDPOINT,
        headers: {
          "Content-Type": "application/json",
        },
        data: payload,
      });

      console.log("📤 Payload Sent to TRMNL:", payload);
      console.log("📥 TRMNL Response:", response);

      $.export("$summary", "✅ Image sent to TRMNL successfully.");
      return {
        sent_payload: payload,
        response_from_trmnl: response,
      };
    } catch (err) {
      console.error(
        "❌ Failed to send to TRMNL:",
        err.response?.data || err.message,
      );
      $.export("$summary", `❌ TRMNL error: ${err.message}`);
      throw err;
    }
  },
});
