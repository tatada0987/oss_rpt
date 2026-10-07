import * as THREE from 'three';

// 1. 장면, 카메라, 렌더러
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060b20);
scene.fog = new THREE.Fog(0x060b20, 35, 110);
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 180);
camera.position.set(0, 5, 11);
camera.lookAt(0, 0, -18);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
scene.add(new THREE.AmbientLight(0x9dbbff, 2));
const light = new THREE.DirectionalLight(0xffffff, 3);
light.position.set(4, 8, 5);
scene.add(light);

// 2. 기본 도형으로 우주선 만들기 (전방은 -Z 방향)
const ship = new THREE.Group();
const hullMaterial = new THREE.MeshStandardMaterial({ color: 0xd7e8ff, metalness: 0.6, roughness: 0.3 });
const body = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.8, 8), hullMaterial);
body.rotation.x = -Math.PI / 2;
ship.add(body);
const wing = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.65), hullMaterial);
wing.position.z = 0.3;
ship.add(wing);
const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12),
  new THREE.MeshStandardMaterial({ color: 0x25dcff, emissive: 0x087fbb, emissiveIntensity: 1 }));
cockpit.scale.set(1, 0.65, 1.7);
cockpit.position.set(0, 0.28, 0);
ship.add(cockpit);
const flame = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.9, 8),
  new THREE.MeshBasicMaterial({ color: 0x49e9ff }));
flame.rotation.x = Math.PI / 2;
flame.position.z = 1.1;
ship.add(flame);
scene.add(ship);

// 3. 별과 비행 경로
const starPositions = new Float32Array(600 * 3);
for (let i = 0; i < 600; i++) {
  starPositions[i * 3] = (Math.random() - 0.5) * 90;
  starPositions[i * 3 + 1] = (Math.random() - 0.5) * 55;
  starPositions[i * 3 + 2] = -Math.random() * 140;
}
const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
scene.add(new THREE.Points(starGeometry,
  new THREE.PointsMaterial({ color: 0xb9dbff, size: 0.12 })));
const grid = new THREE.GridHelper(180, 60, 0x21618c, 0x112a49);
grid.position.set(0, -1.1, -65);
scene.add(grid);

// 4. 게임 상태와 키 입력
const keys = new Set();
const obstacles = [];
const rockGeometry = new THREE.IcosahedronGeometry(1, 0);
const rockMaterial = new THREE.MeshStandardMaterial({ color: 0xe4674a, roughness: 0.9, flatShading: true });
const scoreElement = document.getElementById('score');
const speedElement = document.getElementById('speed');
const overlay = document.getElementById('overlay');
const shipBox = new THREE.Box3();
const rockBox = new THREE.Box3();
let score = 0;
let elapsed = 0;
let spawnTimer = 0;
let gameOver = false;
let lastTime = null;

window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if (['arrowleft', 'arrowright', 'a', 'd', 'r'].includes(key)) event.preventDefault();
  keys.add(key);
  if (key === 'r' && !event.repeat) resetGame();
});
window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => { keys.clear(); lastTime = null; });
document.addEventListener('visibilitychange', () => { keys.clear(); lastTime = null; });
document.getElementById('restart').addEventListener('click', resetGame);

function spawnObstacle() {
  const rock = new THREE.Mesh(rockGeometry, rockMaterial);
  const size = 0.55 + Math.random() * 0.35;
  rock.scale.setScalar(size);
  rock.position.set((Math.random() - 0.5) * 9, 0, -85);
  rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
  scene.add(rock);
  obstacles.push(rock);
}

function finishGame() {
  gameOver = true;
  document.getElementById('finalScore').textContent = `최종 점수: ${score}`;
  overlay.style.display = 'flex';
}

function resetGame() {
  for (const rock of obstacles) scene.remove(rock);
  obstacles.length = 0;
  ship.position.x = 0;
  ship.rotation.z = 0;
  keys.clear();
  score = 0;
  elapsed = 0;
  spawnTimer = 0;
  gameOver = false;
  lastTime = null;
  scoreElement.textContent = '점수: 0';
  speedElement.textContent = '속도: 1.0×';
  overlay.style.display = 'none';
}

// 5. 매 프레임 갱신: 시간 기반 이동으로 화면 주사율 차이를 줄임
renderer.setAnimationLoop((time) => {
  const dt = lastTime === null ? 0 : Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;
  if (!gameOver) {
    elapsed += dt;
    const speed = Math.min(18 + elapsed * 0.7, 36);
    const direction = Number(keys.has('arrowright') || keys.has('d'))
      - Number(keys.has('arrowleft') || keys.has('a'));
    ship.position.x = THREE.MathUtils.clamp(ship.position.x + direction * 7 * dt, -4.5, 4.5);
    ship.rotation.z = THREE.MathUtils.damp(ship.rotation.z, -direction * 0.25, 10, dt);
    flame.scale.y = 0.9 + Math.sin(elapsed * 30) * 0.15;
    speedElement.textContent = `속도: ${(speed / 18).toFixed(1)}×`;

    spawnTimer += dt;
    const interval = Math.max(0.55, 1.15 - elapsed * 0.006);
    if (spawnTimer >= interval) {
      spawnTimer -= interval;
      spawnObstacle();
    }

    // 별이 가까워지면 뒤쪽으로 재배치
    for (let i = 0; i < 600; i++) {
      starPositions[i * 3 + 2] += speed * dt;
      if (starPositions[i * 3 + 2] > 12) starPositions[i * 3 + 2] = -140;
    }
    starGeometry.attributes.position.needsUpdate = true;

    // 전체 우주선(불꽃 제외)의 크기에 가까운 단순 충돌 상자
    shipBox.setFromCenterAndSize(
      new THREE.Vector3(ship.position.x, 0, 0),
      new THREE.Vector3(1.6, 0.7, 1.6)
    );
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const rock = obstacles[i];
      rock.position.z += speed * dt;
      rock.rotation.x += dt * 0.6;
      rock.rotation.y += dt * 0.8;
      rockBox.setFromObject(rock);
      if (shipBox.intersectsBox(rockBox)) {
        finishGame();
        break;
      }
      if (rock.position.z > 3) {
        scene.remove(rock);
        obstacles.splice(i, 1);
        score += 10;
        scoreElement.textContent = `점수: ${score}`;
      }
    }
  }
  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
