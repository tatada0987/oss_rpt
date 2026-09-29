from PIL import Image

image = Image.open("test.jpg")

# 이미지 90도 회전
rotated = image.rotate(90, expand=True)

# 저장
rotated.save("rotated.jpg")

print("이미지 회전 완료!")