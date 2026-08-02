import { isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  Inject,
  NgZone,
  OnDestroy,
  PLATFORM_ID,
  ViewChild,
} from '@angular/core';
import * as THREE from 'three';

@Component({
  selector: 'app-parcel-network-scene',
  standalone: true,
  template: '<canvas #canvas aria-hidden="true"></canvas>',
  host: { class: 'ap-parcel-scene', 'aria-hidden': 'true' },
})
export class ParcelNetworkScene implements AfterViewInit, OnDestroy {
  @ViewChild('canvas', { static: true }) private canvasRef!: ElementRef<HTMLCanvasElement>;

  private renderer?: THREE.WebGLRenderer;
  private scene?: THREE.Scene;
  private camera?: THREE.PerspectiveCamera;
  private parcel?: THREE.Group;
  private route?: THREE.Points;
  private frame = 0;
  private elapsed = 0;
  private visible = true;
  private pointerX = 0;
  private pointerY = 0;
  private resizeObserver?: ResizeObserver;
  private intersectionObserver?: IntersectionObserver;
  private reducedMotion = false;

  constructor(
    @Inject(PLATFORM_ID) private readonly platformId: object,
    private readonly zone: NgZone,
    private readonly host: ElementRef<HTMLElement>,
  ) {}

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    try {
      this.setupScene();
      this.resize();
      this.observe();
      this.render();
      if (!this.reducedMotion) this.zone.runOutsideAngular(() => this.animate());
    } catch {
      this.host.nativeElement.classList.add('is-unavailable');
    }
  }

  private setupScene(): void {
    const canvas = this.canvasRef.nativeElement;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    this.camera.position.set(0, 0.15, 7.5);

    this.scene.add(new THREE.AmbientLight(0xffffff, 2.8));
    const keyLight = new THREE.DirectionalLight(0x9fe870, 5);
    keyLight.position.set(3, 4, 5);
    this.scene.add(keyLight);

    this.parcel = new THREE.Group();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(2.25, 1.65, 1.8, 4, 4, 4),
      new THREE.MeshPhysicalMaterial({
        color: 0x9fe870,
        roughness: 0.24,
        metalness: 0.05,
        clearcoat: 0.5,
      }),
    );
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(box.geometry),
      new THREE.LineBasicMaterial({ color: 0x163300, transparent: true, opacity: 0.55 }),
    );
    this.parcel.add(box, edges);

    const bandMaterial = new THREE.MeshStandardMaterial({ color: 0xfbfaf4, roughness: 0.45 });
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.38, 1.69, 1.84), bandMaterial);
    const bandCross = new THREE.Mesh(new THREE.BoxGeometry(2.29, 0.28, 1.84), bandMaterial);
    this.parcel.add(band, bandCross);
    this.parcel.rotation.set(-0.22, -0.48, 0.08);
    this.scene.add(this.parcel);

    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-3.8, -1.5, -0.4),
      new THREE.Vector3(-2.2, 1.4, 0.1),
      new THREE.Vector3(0, 2.1, -0.6),
      new THREE.Vector3(2.25, 1.25, 0.3),
      new THREE.Vector3(3.7, -1.45, -0.2),
    ]);
    const routeGeometry = new THREE.BufferGeometry().setFromPoints(curve.getSpacedPoints(110));
    this.scene.add(
      new THREE.Line(
        routeGeometry,
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 }),
      ),
    );
    this.route = new THREE.Points(
      routeGeometry,
      new THREE.PointsMaterial({ color: 0x9fe870, size: 0.075, transparent: true, opacity: 0.92 }),
    );
    this.scene.add(this.route);

    for (const point of [curve.getPoint(0), curve.getPoint(0.5), curve.getPoint(1)]) {
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      marker.position.copy(point);
      this.scene.add(marker);
    }
  }

  private observe(): void {
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host.nativeElement);
    this.intersectionObserver = new IntersectionObserver(([entry]) => (this.visible = entry.isIntersecting));
    this.intersectionObserver.observe(this.host.nativeElement);
    this.host.nativeElement.addEventListener('pointermove', this.onPointerMove, { passive: true });
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    const bounds = this.host.nativeElement.getBoundingClientRect();
    this.pointerX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 0.22;
    this.pointerY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 0.14;
  };

  private resize(): void {
    if (!this.renderer || !this.camera) return;
    const { width, height } = this.host.nativeElement.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  private animate = (): void => {
    this.frame = requestAnimationFrame(this.animate);
    if (!this.visible) return;
    this.elapsed += 0.008;
    if (this.parcel) {
      this.parcel.rotation.y += (this.pointerX - this.parcel.rotation.y - 0.48) * 0.025;
      this.parcel.rotation.x += (-this.pointerY - this.parcel.rotation.x - 0.22) * 0.025;
      this.parcel.position.y = Math.sin(this.elapsed * 2) * 0.12;
    }
    if (this.route) this.route.rotation.z = Math.sin(this.elapsed * 0.65) * 0.025;
    this.render();
  };

  private render(): void {
    if (this.renderer && this.scene && this.camera) this.renderer.render(this.scene, this.camera);
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.frame);
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    this.host.nativeElement.removeEventListener('pointermove', this.onPointerMove);
    this.scene?.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      materials.forEach((material) => material.dispose());
    });
    this.renderer?.dispose();
  }
}
