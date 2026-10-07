import * as THREE from 'three';


// ========================================
// 1. Scene
// ========================================

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);


// ========================================
// 2. Camera
// ========================================

const camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);


// ========================================
// 3. Renderer
// ========================================

const renderer = new THREE.WebGLRenderer({
    antialias: true
});

renderer.setSize(
    window.innerWidth,
    window.innerHeight
);

document.body.appendChild(renderer.domElement);


// ========================================
// 4. 조명
// ========================================

const light = new THREE.DirectionalLight(
    0xffffff,
    2
);

light.position.set(5, 15, 5);
scene.add(light);


const ambientLight = new THREE.AmbientLight(
    0xffffff,
    1
);

scene.add(ambientLight);


// ========================================
// 5. 미로 설정
// ========================================

// # = 벽
// . = 길
// S = 시작
// E = 출구

const maze = [
    "###############",
    "#S....#.......#",
    "#####.#.#####.#",
    "#.....#.....#.#",
    "#.#########.#.#",
    "#.........#...#",
    "#.#######.###.#",
    "#.#.....#.....#",
    "#.#.###.#####.#",
    "#...#.........#",
    "###.#.#######.#",
    "#...#.......#.#",
    "#.########.####",
    "#....#.......E#",
    "###############"
];


// 한 칸의 크기
const cellSize = 2;


// 미로 크기
const rows = maze.length;
const cols = maze[0].length;


// ========================================
// 6. 바닥
// ========================================

const floorGeometry = new THREE.PlaneGeometry(
    cols * cellSize,
    rows * cellSize
);

const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x555555
});

const floor = new THREE.Mesh(
    floorGeometry,
    floorMaterial
);

floor.rotation.x = -Math.PI / 2;

scene.add(floor);


// ========================================
// 7. 플레이어
// ========================================

const playerGeometry = new THREE.BoxGeometry(
    0.9,
    0.9,
    0.9
);

const playerMaterial = new THREE.MeshStandardMaterial({
    color: 0x0000ff
});

const player = new THREE.Mesh(
    playerGeometry,
    playerMaterial
);

scene.add(player);


// ========================================
// 8. 벽 목록
// ========================================

const walls = [];


// ========================================
// 9. 출구
// ========================================

let exit;


// ========================================
// 10. 좌표 계산 함수
// ========================================

function getX(col) {

    return (
        col - cols / 2 + 0.5
    ) * cellSize;

}


function getZ(row) {

    return (
        row - rows / 2 + 0.5
    ) * cellSize;

}


// ========================================
// 11. 미로 생성
// ========================================

for (let row = 0; row < rows; row++) {

    for (let col = 0; col < cols; col++) {

        const value = maze[row][col];

        const x = getX(col);
        const z = getZ(row);


        // ----------------------------
        // 벽
        // ----------------------------

        if (value === "#") {

            const geometry = new THREE.BoxGeometry(
                cellSize,
                2,
                cellSize
            );

            const material = new THREE.MeshStandardMaterial({
                color: 0x8b4513
            });

            const wall = new THREE.Mesh(
                geometry,
                material
            );

            wall.position.set(
                x,
                1,
                z
            );

            scene.add(wall);

            walls.push(wall);
        }


        // ----------------------------
        // 시작 위치
        // ----------------------------

        if (value === "S") {

            player.position.set(
                x,
                0.45,
                z
            );

        }


        // ----------------------------
        // 출구
        // ----------------------------

        if (value === "E") {

            const geometry = new THREE.BoxGeometry(
                1.5,
                0.2,
                1.5
            );

            const material = new THREE.MeshStandardMaterial({
                color: 0x00ff00
            });

            exit = new THREE.Mesh(
                geometry,
                material
            );

            exit.position.set(
                x,
                0.1,
                z
            );

            scene.add(exit);
        }
    }
}


// ========================================
// 12. 키보드 입력
// ========================================

const keys = {};


document.addEventListener(
    "keydown",
    function (event) {

        keys[event.key.toLowerCase()] = true;

    }
);


document.addEventListener(
    "keyup",
    function (event) {

        keys[event.key.toLowerCase()] = false;

    }
);


// ========================================
// 13. 충돌 검사
// ========================================

function checkCollision() {

    const playerBox = new THREE.Box3()
        .setFromObject(player);


    for (let wall of walls) {

        const wallBox = new THREE.Box3()
            .setFromObject(wall);


        if (playerBox.intersectsBox(wallBox)) {

            return true;

        }
    }


    return false;
}


// ========================================
// 14. 출구 검사
// ========================================

function checkExit() {

    const playerBox = new THREE.Box3()
        .setFromObject(player);

    const exitBox = new THREE.Box3()
        .setFromObject(exit);


    if (playerBox.intersectsBox(exitBox)) {

        document.getElementById(
            "clearText"
        ).style.display = "block";

        return true;

    }


    return false;
}


// ========================================
// 15. 게임 설정
// ========================================

let gameClear = false;

const speed = 0.07;


// ========================================
// 16. 이동 함수
// ========================================

function movePlayer() {

    // X축 이동
    if (keys["a"]) {

        const oldX = player.position.x;

        player.position.x -= speed;

        if (checkCollision()) {

            player.position.x = oldX;

        }
    }


    if (keys["d"]) {

        const oldX = player.position.x;

        player.position.x += speed;

        if (checkCollision()) {

            player.position.x = oldX;

        }
    }


    // Z축 이동
    if (keys["w"]) {

        const oldZ = player.position.z;

        player.position.z -= speed;

        if (checkCollision()) {

            player.position.z = oldZ;

        }
    }


    if (keys["s"]) {

        const oldZ = player.position.z;

        player.position.z += speed;

        if (checkCollision()) {

            player.position.z = oldZ;

        }
    }
}


// ========================================
// 17. 게임 반복
// ========================================

function animate() {

    if (!gameClear) {

        movePlayer();


        if (checkExit()) {

            gameClear = true;

        }
    }


    // ====================================
    // 위에서 플레이어를 따라가는 카메라
    // ====================================

    camera.position.set(
        player.position.x,
        10,
        player.position.z + 2
    );


    camera.lookAt(
        player.position.x,
        0,
        player.position.z
    );


    renderer.render(
        scene,
        camera
    );
}


renderer.setAnimationLoop(animate);


// ========================================
// 18. 화면 크기 변경
// ========================================

window.addEventListener(
    "resize",
    function () {

        camera.aspect =
            window.innerWidth /
            window.innerHeight;

        camera.updateProjectionMatrix();

        renderer.setSize(
            window.innerWidth,
            window.innerHeight
        );

    }
);