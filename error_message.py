from PIL import Image, ImageDraw, ImageFont
import cv2
def text_to_image(
    text: str,
    font_filepath: str,
    font_size: int,
    color: tuple[int, int, int, int],
) -> Image.Image:
    font = ImageFont.truetype(font_filepath, size=font_size)

    img = Image.new("RGBA", get_text_dimensions(text, font))
    draw = ImageDraw.Draw(img)
    draw_point = (0, 0)

    draw.multiline_text(draw_point, text, font=font, fill=color)

    text_window = img.getbbox()
    img = img.crop(text_window)

    return img

def get_text_dimensions(text_string, font):
    # https://stackoverflow.com/a/46220683/9263761
    ascent, descent = font.getmetrics()

    text_width = font.getmask(text_string).getbbox()[2]
    text_height = font.getmask(text_string).getbbox()[3] + descent

    return (text_width, text_height)

# if __name__ == "__main__":
#     # print(text_to_image("Hello world", "font/Arial.ttf", 12, (255, 255, 255)))
#     text_to_image("Hello world", "font/Arial.ttf", 20, (255, 255, 255)).show()

    
    
