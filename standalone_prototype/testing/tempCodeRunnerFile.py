from PIL import Image, ImageDraw, ImageFont
# import cv2
# def text_to_image(
#     text: str,
#     font_filepath: str,
#     font_size: int,
#     color: tuple[int, int, int, int],
# ) -> Image.Image:
#     font = ImageFont.truetype(font_filepath, size=font_size)

#     img = Image.new("RGBA", font.getmask(text).size)

#     draw = ImageDraw.Draw(img)
#     draw_point = (0, 0)

#     draw.multiline_text(draw_point, text, font=font, fill=color)

#     text_window = img.getbbox()
#     img = img.crop(text_window)

#     return img

# if __name__ == "__main__":
#     # print(text_to_image("Hello world", "font/Arial.ttf", 12, (255, 255, 255)))
#     text_to_image("Hello world", "font/Arial.ttf", 20, (255, 255, 255)).show()

  