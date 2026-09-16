import cv2
from pathlib import Path
def main():
    input_path = Path("images/sample.jpg")
    output_dir = Path("output")
    output_dir.mkdir(exist_ok=True)
    # 이미지 불러오기
    image = cv2.imread(str(input_path))
    if image is None:
        print(f"이미지를 불러올 수 없습니다: {input_path}")
        print("images/sample.jpg 파일이 존재하는지 확인하세요.")
        return
    # 원본 이미지 크기 확인
    height, width, channels = image.shape
    print(f"이미지 크기: {width} x {height}")
    print(f"채널 수: {channels}")
# 1) 흑백 이미지 변환
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
# 2) 가우시안 블러 적용
    blurred = cv2.GaussianBlur(gray, (7, 7), 0)
# 3) 윤곽선 검출
    edges = cv2.Canny(blurred, 80, 160)
# 결과 저장
    cv2.imwrite(str(output_dir / "gray.jpg"), gray)
    cv2.imwrite(str(output_dir / "blurred.jpg"), blurred)
    cv2.imwrite(str(output_dir / "edges.jpg"), edges)
    print("이미지 처리가 완료되었습니다.")
    print("output/gray.jpg")
    print("output/blurred.jpg")
    print("output/edges.jpg")
# 화면에 결과 표시
    cv2.imshow("Original Image", image)
    cv2.imshow("Gray Image", gray)
    cv2.imshow("Edge Detection", edges)
    print("아무 키나 누르면 창이 닫힙니다.")
    cv2.waitKey(0)
    cv2.destroyAllWindows()
main()