console.log('🔌 script.js loaded as ES module');

document.addEventListener('DOMContentLoaded', () => {
});

(async () => {
  
  const THREE = await import('https://esm.sh/three@0.153.0');
  const { OBJLoader } = await import('https://esm.sh/three@0.153.0/examples/jsm/loaders/OBJLoader.js');
  const { MTLLoader } = await import('https://esm.sh/three@0.153.0/examples/jsm/loaders/MTLLoader.js'); 
  const { OrbitControls } = await import('https://esm.sh/three@0.153.0/examples/jsm/controls/OrbitControls.js');

  const BRAIN_INFO = window.BRAIN_INFO || {};

  const HIDDEN_MESH_NAMES = [
    'white_matter_of_telencephalon',
  ];
  const isHiddenMesh = (meshName) => {
    const n = meshName.toLowerCase();
    return HIDDEN_MESH_NAMES.some(h => n.includes(h.toLowerCase()));
  };

  const body  = document.body;

  let isPointerDown = false;
  let pointerDownPos = null;
  let didDragMove = false;
  let pointerInsideContainer = false;
  let lastPointerClientX = null;
  let lastPointerClientY = null;

  let isZooming = false;
  let zoomEndTimer = null;


  const container = document.getElementById('three-container');
  if (!container) return console.error('Missing #three-container');

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    12,
    container.clientWidth / container.clientHeight,
    0.1,
    1000
  );
  camera.position.set(1.2, 0.2, 0.5); 

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  container.appendChild(renderer.domElement);

  scene.add(
    new THREE.HemisphereLight(0xffffff, 0x444444, 0.7),
    (() => { const dl = new THREE.DirectionalLight(0xffffff, 0.6); dl.position.set(2,6,7.5); return dl; })()
  );

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.zoomSpeed    = 0.5;
  controls.minDistance  = 0.15;
  controls.maxDistance  = 2.0;


  let idleTimer = null;
  const IDLE_TIMEOUT = 6000000; 

  function startAutoRotate() {
    if (controls.enableRotate) {
      controls.autoRotate = true;
      controls.autoRotateSpeed =1; 
    }
  }

  function resetIdleTimer() {
    controls.autoRotate = false;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(startAutoRotate, IDLE_TIMEOUT);
  }

  ['pointermove', 'pointerdown', 'wheel', 'keydown'].forEach(evt => {
    window.addEventListener(evt, resetIdleTimer, { passive: true });
  });

  startAutoRotate();
  idleTimer = setTimeout(startAutoRotate, IDLE_TIMEOUT);


  const mmTip = document.createElement('div');
  mmTip.className = 'mm-tooltip';
  document.body.appendChild(mmTip);
  function showTip(text, x, y) {
    mmTip.textContent = text;
    mmTip.style.left = x + 'px';
    mmTip.style.top  = y + 'px';
    mmTip.classList.add('show');
  }
  function hideTip() { mmTip.classList.remove('show'); }

  const objLoader  = new OBJLoader();
  const raycaster  = new THREE.Raycaster();
  const pointer    = new THREE.Vector2();
  let model        = null;

  const keyToMesh = {};
  let selectedMesh = null;
  let selectedPrevEmissive = 0x000000;
  const HOVER_COLOR  = 0x999999;  
  const SELECT_COLOR = 0x87f3ff;
  let isIsolationActive = false;
  const isolateBtn = document.getElementById('isolate-btn');
  const isolationLabel = document.getElementById('isolation-status-label'); 

  function updateIsolationState(isActive) {
    isIsolationActive = isActive;
    
    isolateBtn?.classList.toggle('is-active', isIsolationActive);
    
    if (isolationLabel) {
      if (isIsolationActive) {
        isolationLabel.textContent = 'on';
        isolationLabel.style.color = '#66ff99'; 
      } else {
        isolationLabel.textContent = 'off';
        isolationLabel.style.color = '#c13131';
      }
    }
  }

  // Set the initial default state on load
  updateIsolationState(false);

  function clearIsolation() {
    if (!model) return;
    model.traverse((child) => {
      if (child.isMesh) {
        if (Array.isArray(child.material)) {
          child.material.forEach(mat => {
            mat.transparent = false;
            mat.opacity = 1.0;
          });
        } else if (child.material) {
          child.material.transparent = false;
          child.material.opacity = 1.0;
        }
        child.material.needsUpdate = true;
      }
    });
  }

  function isolateMesh(targetMesh, ghostOpacity = 0.15) {
    if (!model) return;
    model.traverse((child) => {
      if (child.isMesh) {
        const isTarget = (child === targetMesh);

        if (Array.isArray(child.material)) {
          child.material.forEach(mat => {
            mat.transparent = !isTarget;
            mat.opacity = isTarget ? 1.0 : ghostOpacity;
            mat.needsUpdate = true;
          });
        } else if (child.material) {
          child.material.transparent = !isTarget;
          child.material.opacity = isTarget ? 1.0 : ghostOpacity;
          child.material.needsUpdate = true;
        }
      }
    });
  }

  isolateBtn?.addEventListener('click', () => {
    const nextState = !isIsolationActive;
    
    if (nextState) {
      if (selectedMesh) {
        updateIsolationState(true);
        isolateMesh(selectedMesh);
      } else {
        updateIsolationState(false);
      }
    } else {
      updateIsolationState(false);
      clearIsolation();
    }
  });


  let isTrackingActive = true;
  const trackingBtn = document.getElementById('tracking-btn');
  const trackingStatus = document.getElementById('tracking-status');
  const trackingStatusValue = trackingStatus?.querySelector('.tracking-status-value');

  function updateTrackingStatusUI() {
    if (trackingStatus) trackingStatus.classList.toggle('is-on', isTrackingActive);
    if (trackingStatus) trackingStatus.classList.toggle('is-off', !isTrackingActive);
    if (trackingStatusValue) trackingStatusValue.textContent = isTrackingActive ? 'on' : 'off';
  }

  trackingBtn?.addEventListener('click', () => {
    isTrackingActive = !isTrackingActive;
    trackingBtn.classList.toggle('is-active', isTrackingActive);
    updateTrackingStatusUI();
  });

  let isLobeColorActive = true;
  const lobeColorBtn = document.getElementById('lobe-color-btn');

  function applyLobeColors(active) {
    if (!model) return;
    model.traverse((child) => {
      if (!child.isMesh || !child.userData.categoryColor) return;
      forEachMeshMaterial(child, m => {
      if (!m || !m.color) return;
      if (active) {
          m.color.copy(child.userData.categoryColor);
      } else if (m.userData.originalColor) {
          m.color.copy(m.userData.originalColor);
        }
        m.needsUpdate = true;
      });
    });
  }

  lobeColorBtn?.addEventListener('click', () => {
    isLobeColorActive = !isLobeColorActive;
    lobeColorBtn.classList.toggle('is-active', isLobeColorActive);
    applyLobeColors(isLobeColorActive);
  });

  let isTooltipVisible = true;
  const tooltipToggleBtn = document.getElementById('tooltip-toggle-btn');
  tooltipToggleBtn?.addEventListener('click', () => {
    isTooltipVisible = !isTooltipVisible;
    tooltipToggleBtn.classList.toggle('is-active', isTooltipVisible);
    if (!isTooltipVisible) hideTip();
  });

  const opacityRange = document.getElementById('opacity-range');
  const opacityReadout = document.getElementById('opacity-readout');
  let opacityPercent = 100;   
  let isOpacitySliderActive = false;

  function updateOpacityReadout() {
    if (!opacityReadout) return;
    opacityReadout.textContent = selectedMesh
      ? `${opacityPercent}% `
      : '0%';
  }

  function setOpacitySliderAvailability(hasSelection) {
    if (opacityRange) opacityRange.disabled = !hasSelection;
    updateOpacityReadout();
  }

  function applyOpacitySlider() {
    if (!selectedMesh) return;
    isolateMesh(selectedMesh, opacityPercent / 100);
  }

  opacityRange?.addEventListener('input', () => {
    opacityPercent = Number(opacityRange.value);
    isOpacitySliderActive = true;
    updateOpacityReadout();
    applyOpacitySlider();
  });

  setOpacitySliderAvailability(false);

  window.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'i') return;
    if (!selectedMesh) return;
    e.preventDefault();

    opacityPercent = 3;
    isOpacitySliderActive = true;
    if (opacityRange) opacityRange.value = 3;
    updateOpacityReadout();
    applyOpacitySlider();
  });



  const mtlLoader = new MTLLoader();
  
  mtlLoader.load('Brain2.1.mtl', (materials) => {
    materials.preload();

    const cortexMat = materials.materials?.Brain;
    if (cortexMat) {
      cortexMat.shininess = 40;
      cortexMat.specular.setScalar(0.12);
    }

    objLoader.setMaterials(materials);
    objLoader.load(
      'Brain2.obj',
      obj => {
        model = obj;

        const uniqueNames = new Set();
        obj.traverse(ch => { if (ch.isMesh) uniqueNames.add(ch.name); });
        console.log("📋 UNIQUE MESH NAMES:", Array.from(uniqueNames));
        
        const box = new THREE.Box3().setFromObject(obj);
        const center = box.getCenter(new THREE.Vector3());
        obj.position.sub(center);

        obj.traverse(ch => {
            
          if (ch.isLine || ch.type === 'LineSegments' || ch.type === 'Line') {
            ch.visible = false; 
            return; 
          }

          if (ch.isMesh) {
            const meshName = (ch.name || '').toLowerCase();


            let bestKey = null;
            for (const k of Object.keys(BRAIN_INFO)) {
              if (meshName.includes(k.toLowerCase()) && (!bestKey || k.length > bestKey.length)) {
                bestKey = k;
              }
            }
            ch.userData.brainInfoKey = bestKey;
            if (bestKey && !keyToMesh[bestKey]) keyToMesh[bestKey] = ch;

            if (isHiddenMesh(meshName)) {
              ch.visible = false;
              return;
            }

     
            
            const isPureOutline = false;

            if (isPureOutline) {
              ch.visible = false;
              return;             
            }

            if (ch.material) {
              if (Array.isArray(ch.material)) {
                ch.material = ch.material.map(m => m.clone());
              } else {
                ch.material = ch.material.clone();
              }
            }

 
            
            if (ch.material) {
              const mats = Array.isArray(ch.material) ? ch.material : [ch.material];
              mats.forEach(m => {
                if (m && m.color) m.userData.originalColor = m.color.clone();
              });
            }
            if (ch.userData.brainInfoKey && window.categorizeBrainInfo && window.CATEGORY_COLORS) {
              const info = BRAIN_INFO[ch.userData.brainInfoKey];
              const cat = window.categorizeBrainInfo(info);
              const colorHex = cat && window.CATEGORY_COLORS[cat];
              if (colorHex) ch.userData.categoryColor = new THREE.Color(colorHex);
            }

            ch.userData.originalPosition = ch.position.clone();
            ch.geometry.computeBoundingBox();
            const meshCenter = new THREE.Vector3();
            ch.geometry.boundingBox.getCenter(meshCenter);
            ch.userData.explodeDirection = meshCenter.clone().normalize();
          }
        });

        scene.add(obj);

        applyLobeColors(isLobeColorActive);
      },
      xhr => console.log(`Model ${(xhr.loaded / xhr.total * 100).toFixed(0)}% loaded`),
      err => console.error('OBJ load error', err)
    );
  });

  window.addEventListener('mm:filterMeshes', (e) => {
    const { allowedKeys, isFiltering } = e.detail;
    if (!model) return;

    model.traverse((child) => {
      if (child.isMesh) {
        const meshName = (child.name || '').toLowerCase();
        const foundKey = Object.keys(BRAIN_INFO).find(k => meshName.includes(k.toLowerCase()));

        const isAllowed = !isFiltering || (foundKey && allowedKeys.includes(foundKey));

        if (Array.isArray(child.material)) {
          child.material.forEach(mat => {
            mat.transparent = !isAllowed;
            mat.opacity = isAllowed ? 1.0 : 0.05; 
            mat.needsUpdate = true;
          });
        } else if (child.material) {
          child.material.transparent = !isAllowed;
          child.material.opacity = isAllowed ? 1.0 : 0.05;
          child.material.needsUpdate = true;
        }
      }
    });
  });




  function getMeshForKey(key) {
    if (!model || !key) return null;
    return keyToMesh[key] || null;
  }

  function forEachMeshMaterial(mesh, fn) {
    if (!mesh || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach(fn);
  }
  function setMeshEmissive(mesh, hex) {
    forEachMeshMaterial(mesh, m => { if (m && m.emissive) m.emissive.setHex(hex); });
  }
  function getMeshEmissive(mesh) {
    if (!mesh || !mesh.material) return 0x000000;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const withEmissive = mats.find(m => m && m.emissive);
    return withEmissive ? withEmissive.emissive.getHex() : 0x000000;
  }

  function highlightMesh(mesh) {
    if (selectedMesh) {
      setMeshEmissive(selectedMesh, selectedPrevEmissive);
    }
    selectedMesh = mesh || null;
    if (selectedMesh) {
      selectedPrevEmissive = getMeshEmissive(selectedMesh);
      setMeshEmissive(selectedMesh, SELECT_COLOR);
    }

    if (isIsolationActive && selectedMesh) {
      isolateMesh(selectedMesh);
    } else if (isIsolationActive && !selectedMesh) {
      updateIsolationState(false);
      clearIsolation();
    }

    // Opacity slider follows selection the same way: reapply its
    // current value to whatever's newly selected, or reset once
    // nothing is selected.
    if (selectedMesh) {
      if (isOpacitySliderActive) applyOpacitySlider();
    } else if (isOpacitySliderActive) {
      isOpacitySliderActive = false;
      opacityPercent = 100;
      if (opacityRange) opacityRange.value = 100;
      clearIsolation();
    }
    setOpacitySliderAvailability(!!selectedMesh);
  }

  function selectMeshByKey(key) {
    const m = getMeshForKey(key);
    if (!m) return false;
    highlightMesh(m);
    if (m && m !== currentHover && currentHover) {
      setMeshEmissive(currentHover, 0x000000);
    }
    return true;
  }

function zoomToMesh(mesh, opts = {}) {
   if (!mesh || !camera) return;
    const { duration = 900, fitRatio = 1.75, reorient = false } = opts; 

    const box = new THREE.Box3().setFromObject(mesh);
    const sphere = box.getBoundingSphere(new THREE.Sphere());

    const startPos = camera.position.clone();
    const startTarget = controls ? controls.target.clone() : new THREE.Vector3();
    const endTarget = sphere.center.clone();

    let dir;
    if (reorient) {
      const worldOrigin = new THREE.Vector3(0, 0, 0);
      dir = new THREE.Vector3().subVectors(sphere.center, worldOrigin).normalize();
      
      if (dir.lengthSq() === 0) {
        dir = startPos.clone().sub(startTarget).normalize();
      }
    } else {
      dir = startPos.clone().sub(startTarget).normalize();
    }

    const dist = sphere.radius * fitRatio / Math.sin(THREE.MathUtils.degToRad(camera.fov * 0.5));
    const endPos = endTarget.clone().add(dir.multiplyScalar(dist));

    const t0 = performance.now();
    function animateZoom() {
      const t = Math.min(1, (performance.now() - t0) / duration);
      // ease in-out formula
      const e = t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t;

      camera.position.lerpVectors(startPos, endPos, e);
      if (controls) {
        controls.target.lerpVectors(startTarget, endTarget, e);
        controls.update();
      }
      camera.lookAt(controls ? controls.target : endTarget);
      
      if (t < 1) requestAnimationFrame(animateZoom);
    }
    animateZoom();
  }

  function autoZoomToKey(key, opts) {
    const m = getMeshForKey(key);
    if (m) zoomToMesh(m, opts);
  }

  function getValidRaycastHit(hits) {
    for (const hit of hits) {
      const mesh = hit.object;

      if (!mesh.visible) continue;

     let isGhosted = false;
  if (Array.isArray(mesh.material)) {
  isGhosted = mesh.material[0].opacity < 0.5;
      } else if (mesh.material) {
      isGhosted = mesh.material.opacity < 0.5;
      }
      if (isGhosted) continue;
      const foundKey = mesh.userData.brainInfoKey;

      if (foundKey) {
        return { mesh: mesh, key: foundKey };
      } else {
        return null; 
      }
    }
    return null;
  }

  let currentHover = null;

  const HOVER_RAYCAST_EVERY_N_FRAMES = 3;
  let hoverFrameCounter = 0;

  function updateHover() {
    if (!model || !pointerInsideContainer || isPointerDown || isZooming || lastPointerClientX == null) {
      if (currentHover) {
        setMeshEmissive(currentHover, 0x000000);
        currentHover = null;
      }
      hideTip();
      hoverFrameCounter = 0;
      return;
    }

    hoverFrameCounter = (hoverFrameCounter + 1) % HOVER_RAYCAST_EVERY_N_FRAMES;
    if (hoverFrameCounter !== 0) return;

    const rect = container.getBoundingClientRect();
    pointer.x = ((lastPointerClientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((lastPointerClientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    const hits = raycaster.intersectObject(model, true);
    const validTarget = getValidRaycastHit(hits);

    if (validTarget) {
      const mesh = validTarget.mesh;
      const validKey = validTarget.key;

      if (currentHover !== mesh) {
        if (currentHover && currentHover !== selectedMesh) {
          setMeshEmissive(currentHover, 0x000000);
        }
        if (mesh !== selectedMesh) {
          setMeshEmissive(mesh, HOVER_COLOR);
        }
        currentHover = mesh;
      }
      if (isTooltipVisible) {
        showTip(BRAIN_INFO[validKey].title, lastPointerClientX + 12, lastPointerClientY + 12);
      } else {
        hideTip();
      }
    } else {
      if (currentHover && currentHover !== selectedMesh) {
        setMeshEmissive(currentHover, 0x000000);
      }
      currentHover = null;
      hideTip();
    }
  }

  container.addEventListener('pointerenter', e => {
    pointerInsideContainer = true;
    lastPointerClientX = e.clientX;
    lastPointerClientY = e.clientY;
  });

  container.addEventListener('wheel', () => {
    isZooming = true;
    if (zoomEndTimer) clearTimeout(zoomEndTimer);
    zoomEndTimer = setTimeout(() => { isZooming = false; }, 150);
  }, { passive: true });

  container.addEventListener('pointermove', e => {
    lastPointerClientX = e.clientX;
    lastPointerClientY = e.clientY;
    pointerInsideContainer = true;

    if (isPointerDown && pointerDownPos) {
      const dx = e.clientX - pointerDownPos.x;
      const dy = e.clientY - pointerDownPos.y;
      if (Math.hypot(dx, dy) > 4) didDragMove = true;
    }
    // Actual hover raycasting happens once per frame in updateHover(),
    // called from the render loop — see below.
  });

  container.addEventListener('pointerleave', () => {
    pointerInsideContainer = false;
    hideTip();
  });

  container.addEventListener('pointerdown', e => {
    isPointerDown = true;
    didDragMove = false;
    pointerDownPos = { x: e.clientX, y: e.clientY };
  });

  // Listen on window (not just container) so a drag that ends outside
  // the viewer — pointer released after dragging off the canvas — still
  // clears the down-state. This is what used to get "stuck" and require
  // an extra click before hover would work again.
  window.addEventListener('pointerup', () => {
    isPointerDown = false;
  });

  container.addEventListener('pointerup', e => {
    const wasDragging = didDragMove;

    if (e.target.closest('button') || 
        e.target.closest('.controls') || 
        e.target.closest('.viewer-hud-right')) {
      return; 
    }
    
    if (wasDragging) return;
  
    if (!model) return;
    const rect = container.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    
    const hits = raycaster.intersectObject(model, true);
    const validTarget = getValidRaycastHit(hits);
  
    if (validTarget) {
      const mesh = validTarget.mesh;
      const key = validTarget.key;
      
      if (mesh !== selectedMesh) {
        highlightMesh(mesh);
        openSidebarWith(key);
        if (isTrackingActive) autoZoomToKey(key, { duration: 900, fitRatio: 1.35 });
      }
    } else {
      highlightMesh(null);
      if (window.clearSidebar) {
        window.clearSidebar();
      }
    }
  });


  const closePanelBtn = document.querySelector('.close-panel-btn');
  const infoPanel = document.getElementById('panel');

  closePanelBtn?.addEventListener('click', () => {
    infoPanel?.classList.add('is-closed');
    
    if (typeof highlightMesh === 'function') {
      highlightMesh(null);
    }
    
    if (window.clearSidebar) {
      window.clearSidebar();
    }
  });

  const centerBtn = document.getElementById('center-btn');
  
  centerBtn?.addEventListener('click', () => {
    camera.position.set(1, 0.2, 0.5);   
    controls.target.set(0, 0, 0);
    controls.update();
  });
 
  window.addEventListener('mm:selected', (e) => {
    const key = e.detail?.name;
    if (!key) return;

    selectMeshByKey(key);
    if (isTrackingActive) autoZoomToKey(key, { duration: 900, fitRatio: 1.75 });

    document.getElementById('panel')?.classList.remove('is-closed');
 });

 window.addEventListener('resize', () => {
 camera.aspect = container.clientWidth / container.clientHeight;
 camera.updateProjectionMatrix();
   renderer.setSize(container.clientWidth, container.clientHeight);
  });


const rotationSlider = document.getElementById('rotation-slider');
const anatomicalLabel = document.getElementById('current-view-label');  
const startPos = new THREE.Vector3(0.6, 0.6, 2.3);
const initialAzimuth = Math.atan2(startPos.x, startPos.z);

  function updateAnatomyLabel() {
      if (!anatomicalLabel || !camera || !controls) return;

      const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);

      const polarDeg = THREE.MathUtils.radToDeg(spherical.phi);
      
      let azimuthDiff = spherical.theta - initialAzimuth;
      while (azimuthDiff < 0) azimuthDiff += Math.PI * 2;
      while (azimuthDiff > Math.PI * 2) azimuthDiff -= Math.PI * 2;
      const azimuthDeg = THREE.MathUtils.radToDeg(azimuthDiff);

      let direction = "";

      if (polarDeg <= 35) {
          direction = "Superior";
      } else if (polarDeg >= 145) {
          direction = "Inferior";
      } else {
          let verticalModifier = "";
          if (polarDeg > 35 && polarDeg < 65) verticalModifier = "Superior-";
          if (polarDeg > 115 && polarDeg < 145) verticalModifier = "Inferior-";

          let horizontalView = "";
          if (azimuthDeg >= 315 || azimuthDeg < 45) horizontalView = "Anterior";
          else if (azimuthDeg >= 45 && azimuthDeg < 135) horizontalView = "Lateral [L]"; 
          else if (azimuthDeg >= 135 && azimuthDeg < 225) horizontalView = "Posterior";
          else if (azimuthDeg >= 225 && azimuthDeg < 315) horizontalView = "Lateral [R]";

          direction = verticalModifier + horizontalView;
      }

      anatomicalLabel.textContent = direction;
  }

  function syncRotationUI() {
    if (rotationSlider && document.activeElement !== rotationSlider) {
      const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      
      let angleDiff = spherical.theta - initialAzimuth;
      while (angleDiff < 0) angleDiff += Math.PI * 2;
      while (angleDiff > Math.PI * 2) angleDiff -= Math.PI * 2;

      rotationSlider.value = THREE.MathUtils.radToDeg(angleDiff);
    }
    updateAnatomyLabel();
  }

  rotationSlider?.addEventListener('input', (e) => {
    const deg = parseFloat(e.target.value);
    const radians = THREE.MathUtils.degToRad(deg);
    
    const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);

    spherical.theta = initialAzimuth + radians;

    offset.setFromSpherical(spherical);
    camera.position.copy(controls.target).add(offset);
    
    camera.lookAt(controls.target);
    controls.update();
    
    updateAnatomyLabel(); 
  });
  controls.addEventListener('change', syncRotationUI);
  
  setTimeout(syncRotationUI, 100);

  (function animate() {
    requestAnimationFrame(animate);
    controls.update();

    if (controls.autoRotate) {
      syncRotationUI();
    }

    updateHover();

    renderer.render(scene, camera);
  })();

  const toggleBtn = document.querySelector('.index-tog');
  const leftHand = document.getElementById('left-hand');

  if (toggleBtn && leftHand) {
    toggleBtn.addEventListener('click', () => {
      leftHand.classList.toggle('collapsed');
    });
  }

  window.addEventListener('mm:changeView', (e) => {
    const targetView = e.detail.view; 
    if (!camera || !controls) return;

    const dist = camera.position.distanceTo(controls.target);
    const target = controls.target.clone(); 

    let newPos = new THREE.Vector3();

    switch(targetView) {
      case 'anterior':
        newPos.set(0, 0, dist);
        break;
      case 'posterior':
        newPos.set(0, 0, -dist);
        break;
      case 'lateral-right':
        newPos.set(-dist, 0, 0); 
        break;
      case 'lateral-left':
        newPos.set(dist, 0, 0); 
        break;
      case 'superior':
        newPos.set(0, dist, 0.001); 
        break;
      case 'inferior':
        newPos.set(0, -dist, 0.001); 
        break;
      default:
        return;
    }

    newPos.add(target);

    const startPos = camera.position.clone();
    const duration = 600; 
    const t0 = performance.now();
    
    function animateView() {
      const t = Math.min(1, (performance.now() - t0) / duration);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      
      camera.position.lerpVectors(startPos, newPos, ease);
      camera.lookAt(target);
      controls.update(); 
      
      if (t < 1) {
        requestAnimationFrame(animateView);
      }
    }
    
    animateView();
  });

  const viewDropdownContainer = document.getElementById('view-dropdown-container');
  const viewDropdownTrigger = document.getElementById('view-dropdown-trigger');
  const viewDropdownMenu = document.getElementById('view-dropdown-menu');

  function setViewDropdownOpen(open) {
    viewDropdownContainer?.classList.toggle('is-open', open);
    viewDropdownTrigger?.setAttribute('aria-expanded', String(open));
  }

  viewDropdownTrigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    setViewDropdownOpen(!viewDropdownContainer?.classList.contains('is-open'));
  });

  viewDropdownTrigger?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    setViewDropdownOpen(!viewDropdownContainer?.classList.contains('is-open'));
  });

  viewDropdownMenu?.addEventListener('click', (e) => {
    const item = e.target.closest('.view-dropdown-item');
    if (!item) return;
    window.dispatchEvent(new CustomEvent('mm:changeView', { detail: { view: item.dataset.view } }));
    setViewDropdownOpen(false);
  });

  document.addEventListener('click', (e) => {
    if (viewDropdownContainer && !viewDropdownContainer.contains(e.target)) {
      setViewDropdownOpen(false);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setViewDropdownOpen(false);
  });


  const explodeBtn = document.getElementById('explode-btn');
  const explodeRange = document.getElementById('explode-range');
  const explodeReadout = document.getElementById('explode-readout');

  let isExploded = false;
  let currentExplodePercent = 0.0;
  let explodeAnimationId = null;

  const EXPLODE_LATERAL_SCALE = 2;
  const EXPLODE_VERTICAL_SCALE = 0;
  const EXPLODE_DEPTH_SCALE = 0;

  function applyExplodeFraction(fraction) {
    if (!model) return;
    model.traverse((child) => {
      if (child.isMesh && child.userData.explodeDirection) {
        const pos = child.userData.originalPosition.clone();
        const dir = child.userData.explodeDirection.clone();

        dir.x *= EXPLODE_LATERAL_SCALE;
        dir.y *= EXPLODE_VERTICAL_SCALE;
        dir.z *= EXPLODE_DEPTH_SCALE;

        const explodeOffset = dir.multiplyScalar(fraction);
        child.position.copy(pos.add(explodeOffset));
      }
    });
  }

  function updateExplodeUI(fraction) {
    const pct = Math.round(fraction * 100);
    if (explodeRange) explodeRange.value = pct;
    if (explodeReadout) explodeReadout.textContent = `${pct}%`;
    explodeBtn?.classList.toggle('is-active', fraction > 0);
  }

  function animateExplode(targetPercent) {
    if (!model) return;

    const duration = 1400;
    const startPercent = currentExplodePercent;
    const t0 = performance.now();

    if (explodeAnimationId) cancelAnimationFrame(explodeAnimationId);

    function step() {
      const t = Math.min(1, (performance.now() - t0) / duration);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

      currentExplodePercent = startPercent + (targetPercent - startPercent) * ease;
      applyExplodeFraction(currentExplodePercent);
      updateExplodeUI(currentExplodePercent);

      if (t < 1) {
        explodeAnimationId = requestAnimationFrame(step);
      }
    }
    step();
  }

  explodeBtn?.addEventListener('click', () => {
    isExploded = !isExploded;
    animateExplode(isExploded ? 1.0 : 0.0);
  });
  explodeRange?.addEventListener('input', () => {
    if (explodeAnimationId) cancelAnimationFrame(explodeAnimationId);
    const fraction = Number(explodeRange.value) / 100;
    currentExplodePercent = fraction;
    isExploded = fraction > 0;
    applyExplodeFraction(fraction);
    updateExplodeUI(fraction);
  });


  window.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'b') return;
    e.preventDefault();
    isExploded = !isExploded;
    animateExplode(isExploded ? 1.0 : 0.0);
  });
  updateExplodeUI(0);

  const lockBtn = document.getElementById('rotation-lock-btn');
  let isRotationLocked = false;

  lockBtn?.addEventListener('click', () => {
    isRotationLocked = !isRotationLocked;

    controls.enableRotate = !isRotationLocked;
    
    if (isRotationLocked) {
      controls.autoRotate = false;
    }

    lockBtn.classList.toggle('is-active', isRotationLocked);

    const rotationSlider = document.getElementById('rotation-slider');
    if (rotationSlider) {
      rotationSlider.disabled = isRotationLocked;
      rotationSlider.style.opacity = isRotationLocked ? '0.3' : '1';
    }
  });

  const settingsToggleBtn = document.getElementById('settings-toggle-btn');
  const extControls = document.getElementById('viewer-ext_controls');

  settingsToggleBtn?.addEventListener('click', () => {
    extControls?.classList.toggle('is-collapsed');
  });

window.addEventListener('brain:filter', (e) => {
    const activeKeys = e.detail.activeMeshes.map(key => key.toLowerCase());
    const allKeys = Object.keys(BRAIN_INFO).map(k => k.toLowerCase());

    scene.traverse((child) => {
        if (child.isMesh && child.name && child.visible !== false) {
            const meshNameLower = child.name.toLowerCase();
            if (isHiddenMesh(meshNameLower)) return; 

            const hasEntry = allKeys.some(key => meshNameLower.includes(key));
            const isVisible = !hasEntry || activeKeys.some(key => meshNameLower.includes(key));

            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach(mat => {
                if (mat) {
                    mat.transparent = true;
                    mat.opacity = isVisible ? 1.0 : 0.05;
                    mat.needsUpdate = true;
                }
            });
        }
    });
});

})();
