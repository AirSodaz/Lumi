import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type WheelEvent,
} from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type MotionStyle,
  type TargetAndTransition,
  type Transition,
} from "motion/react";
import { Server } from "lucide-react";
import { MediaRail } from "../../components/media";
import { MotionButton } from "../../components/motion";
import { useI18n } from "../../lib/i18n";
import { formatMetadata } from "../../lib/media/format";
import { createSurfaceMotion } from "../../lib/motion/presets";
import {
  useHomeRows,
  type LibraryItem,
  type ServerProfile,
} from "../../lib/tauriClient";

const FEATURED_CAROUSEL_INTERVAL_MS = 8_000;
const FEATURED_WHEEL_THRESHOLD = 48;
const FEATURED_WHEEL_COOLDOWN_MS = 420;
const GAMEPAD_AXIS_THRESHOLD = 0.55;
const EMPTY_FEATURED_ITEMS: LibraryItem[] = [];

type FeaturedArtworkStyle = MotionStyle & {
  "--featured-artwork": string;
};

type FeaturedMotionState = {
  animate: TargetAndTransition;
  exit: TargetAndTransition;
  initial: TargetAndTransition;
  transition: Transition;
};

type HomeViewProps = {
  libraries: LibraryItem[];
  librariesLoading: boolean;
  onOpenLibrary: (item: LibraryItem) => void;
  onOpenMedia: (item: LibraryItem) => void;
  onOpenSettings: () => void;
  selectedServer: ServerProfile | null;
  servers: ServerProfile[];
  serversLoading: boolean;
};

export function HomeView({
  libraries,
  librariesLoading,
  onOpenLibrary,
  onOpenMedia,
  onOpenSettings,
  selectedServer,
  serversLoading,
}: HomeViewProps) {
  const reducedMotion = useReducedMotion();
  const prefersReducedMotion = usePrefersReducedMotion();
  const { locale, translate } = useI18n();
  const server = selectedServer;
  const libraryIds = libraries.map((library) => library.id);
  const homeRows = useHomeRows(server?.id, libraryIds);
  const loading =
    serversLoading ||
    librariesLoading ||
    homeRows.isLoading;
  const continueWatching = homeRows.data?.continueWatching ?? [];
  const latestByLibrary = libraries.map((library) => ({
    items:
      homeRows.data?.latestByLibrary.find((row) => row.libraryId === library.id)
        ?.items ?? [],
    library,
  }));
  const firstLatest = latestByLibrary.find((row) => row.items.length > 0)?.items[0] ?? null;
  const randomFeaturedItems = homeRows.data?.featuredItems ?? EMPTY_FEATURED_ITEMS;
  const fallbackFeatured = continueWatching[0] ?? firstLatest;
  const featuredItems = randomFeaturedItems.length > 0
    ? randomFeaturedItems
    : fallbackFeatured
      ? [fallbackFeatured]
      : EMPTY_FEATURED_ITEMS;
  const featuredItemIds = featuredItems.map((item) => item.id).join(":");
  const [selectedFeaturedId, setSelectedFeaturedId] = useState<string | null>(null);
  const [featuredFocusWithin, setFeaturedFocusWithin] = useState(false);
  const featuredButtonRef = useRef<HTMLButtonElement>(null);
  const featuredFocusWithinRef = useRef(false);
  const featuredPointerWithinRef = useRef(false);
  const lastFeaturedWheelAtRef = useRef(0);
  const gamepadPressedRef = useRef({
    activate: false,
    next: false,
    previous: false,
  });
  const canCycleFeatured = featuredItems.length > 1;
  const selectedFeaturedIndex = selectedFeaturedId
    ? featuredItems.findIndex((item) => item.id === selectedFeaturedId)
    : -1;
  const featuredIndex = selectedFeaturedIndex >= 0 ? selectedFeaturedIndex : 0;
  const nextFeaturedId = canCycleFeatured
    ? featuredItems[(featuredIndex + 1) % featuredItems.length]?.id ?? null
    : null;
  const previousFeaturedId = canCycleFeatured
    ? featuredItems[(featuredIndex - 1 + featuredItems.length) % featuredItems.length]?.id ?? null
    : null;
  const featured = featuredItems[featuredIndex] ?? featuredItems[0] ?? null;
  const featuredTitle =
    featured?.title ??
    (server ? server.name : translate("home.featured.connectTitle"));
  const featuredDescription =
    featured?.overview ??
    (server
      ? translate("home.featured.connectedDescription")
      : translate("home.featured.connectDescription"));
  const featuredArtwork = featured?.backdropUrl ?? featured?.posterUrl ?? null;
  const featuredArtworkStyle = featuredArtwork
    ? ({
        "--featured-artwork": `url("${featuredArtwork}")`,
      } satisfies FeaturedArtworkStyle)
    : undefined;
  const featuredMotionKey = featured?.id ?? "empty-featured";
  const featuredBackdropKey = featuredArtwork
    ? `${featuredMotionKey}:${featuredArtwork}`
    : `${featuredMotionKey}:empty-artwork`;
  const instantTransition = { duration: 0.01 } satisfies Transition;
  const carouselEase = [0.22, 1, 0.36, 1] satisfies Transition["ease"];
  const featuredBackdropMotion = reducedMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: instantTransition,
      }
    : {
        initial: { opacity: 0, scale: 1.018, x: 8 },
        animate: { opacity: 1, scale: 1.035, x: 0 },
        exit: { opacity: 0, scale: 1.05, x: -6 },
        transition: { duration: 0.38, ease: carouselEase },
      } satisfies FeaturedMotionState;
  const featuredCopyMotion = reducedMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: instantTransition,
      }
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -8 },
        transition: { duration: 0.26, ease: carouselEase },
      } satisfies FeaturedMotionState;

  const showFeaturedByIndex = useCallback((index: number) => {
    const itemId = featuredItemIds.split(":")[index];
    if (itemId) {
      setSelectedFeaturedId(itemId);
    }
  }, [featuredItemIds]);

  const showNextFeatured = useCallback(() => {
    if (nextFeaturedId) {
      setSelectedFeaturedId(nextFeaturedId);
    }
  }, [nextFeaturedId]);

  const showPreviousFeatured = useCallback(() => {
    if (previousFeaturedId) {
      setSelectedFeaturedId(previousFeaturedId);
    }
  }, [previousFeaturedId]);

  function handleFeaturedFocus(event: FocusEvent<HTMLElement>) {
    if (event.currentTarget.contains(event.target)) {
      featuredFocusWithinRef.current = true;
      setFeaturedFocusWithin(true);
    }
  }

  function handleFeaturedBlur(event: FocusEvent<HTMLElement>) {
    const nextFocus = event.relatedTarget;

    if (!(nextFocus instanceof Node) || !event.currentTarget.contains(nextFocus)) {
      featuredFocusWithinRef.current = false;
      setFeaturedFocusWithin(false);
      gamepadPressedRef.current = {
        activate: false,
        next: false,
        previous: false,
      };
    }
  }

  function handleFeaturedKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!canCycleFeatured) {
      return;
    }

    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        showPreviousFeatured();
        break;
      case "ArrowRight":
        event.preventDefault();
        showNextFeatured();
        break;
      case "Home":
        event.preventDefault();
        showFeaturedByIndex(0);
        break;
      case "End":
        event.preventDefault();
        showFeaturedByIndex(featuredItems.length - 1);
        break;
      default:
        break;
    }
  }

  function handleFeaturedWheel(event: WheelEvent<HTMLElement>) {
    if (
      !canCycleFeatured ||
      (!featuredFocusWithinRef.current && !featuredPointerWithinRef.current)
    ) {
      return;
    }

    const absoluteX = Math.abs(event.deltaX);
    const absoluteY = Math.abs(event.deltaY);
    if (absoluteX < FEATURED_WHEEL_THRESHOLD || absoluteX <= absoluteY) {
      return;
    }

    const now = Date.now();
    if (now - lastFeaturedWheelAtRef.current < FEATURED_WHEEL_COOLDOWN_MS) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    lastFeaturedWheelAtRef.current = now;

    if (event.deltaX > 0) {
      showNextFeatured();
      return;
    }

    showPreviousFeatured();
  }

  useEffect(() => {
    if (prefersReducedMotion || !canCycleFeatured) {
      return;
    }

    const timer = window.setInterval(() => {
      setSelectedFeaturedId(nextFeaturedId);
    }, FEATURED_CAROUSEL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [canCycleFeatured, nextFeaturedId, prefersReducedMotion]);

  useEffect(() => {
    if (!featuredFocusWithin || !featured || typeof navigator.getGamepads !== "function") {
      return;
    }

    let animationFrame = 0;

    const pollGamepads = () => {
      const gamepads = Array.from(navigator.getGamepads()).filter(
        (gamepad): gamepad is Gamepad => Boolean(gamepad?.connected),
      );
      const previousPressed = gamepadPressedRef.current;
      const currentPressed = gamepads.reduce(
        (pressed, gamepad) => {
          const primaryButton = Boolean(gamepad.buttons[0]?.pressed);
          const leftShoulder = Boolean(gamepad.buttons[4]?.pressed);
          const rightShoulder = Boolean(gamepad.buttons[5]?.pressed);
          const dpadLeft = Boolean(gamepad.buttons[14]?.pressed);
          const dpadRight = Boolean(gamepad.buttons[15]?.pressed);
          const leftStick = gamepad.axes[0] ?? 0;

          return {
            activate: pressed.activate || primaryButton,
            next: pressed.next || rightShoulder || dpadRight || leftStick > GAMEPAD_AXIS_THRESHOLD,
            previous: pressed.previous || leftShoulder || dpadLeft || leftStick < -GAMEPAD_AXIS_THRESHOLD,
          };
        },
        { activate: false, next: false, previous: false },
      );

      if (currentPressed.activate && !previousPressed.activate) {
        featuredButtonRef.current?.click();
      } else if (canCycleFeatured && currentPressed.next && !previousPressed.next) {
        showNextFeatured();
      } else if (canCycleFeatured && currentPressed.previous && !previousPressed.previous) {
        showPreviousFeatured();
      }

      gamepadPressedRef.current = currentPressed;
      animationFrame = window.requestAnimationFrame(pollGamepads);
    };

    animationFrame = window.requestAnimationFrame(pollGamepads);

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [
    canCycleFeatured,
    featured,
    featuredFocusWithin,
    showNextFeatured,
    showPreviousFeatured,
  ]);

  const showNoServerHome = !server && !serversLoading;

  if (showNoServerHome) {
    return (
      <section className="view-stack home-view app-workbench" aria-labelledby="home-title">
        <h1 className="sr-only" id="home-title">{translate("nav.home")}</h1>
        <motion.div
          aria-labelledby="home-no-server-title"
          className="home-no-server"
          data-motion-surface="home-no-server"
          {...createSurfaceMotion(reducedMotion, 0)}
        >
          <div className="home-no-server-copy">
            <span className="workbench-kicker">{translate("home.noServer.kicker")}</span>
            <h2 id="home-no-server-title">{translate("home.noServer.title")}</h2>
            <p>{translate("home.noServer.description")}</p>
            <div className="home-no-server-actions">
              <MotionButton className="primary-action" onClick={onOpenSettings} type="button">
                <Server aria-hidden="true" size={15} />
                <span>{translate("home.action.addServer")}</span>
              </MotionButton>
            </div>
          </div>
        </motion.div>
      </section>
    );
  }

  return (
    <section className="view-stack home-view app-workbench" aria-labelledby="home-title">
      <h1 className="sr-only" id="home-title">{translate("nav.home")}</h1>

      <motion.div
        aria-labelledby="home-featured-title"
        aria-roledescription="carousel"
        className={`featured-hero ${featuredArtwork ? "has-art" : ""}`.trim()}
        data-motion-surface="featured-hero"
        onBlurCapture={handleFeaturedBlur}
        onFocusCapture={handleFeaturedFocus}
        onKeyDown={handleFeaturedKeyDown}
        onPointerEnter={() => {
          featuredPointerWithinRef.current = true;
        }}
        onPointerLeave={() => {
          featuredPointerWithinRef.current = false;
        }}
        onWheel={handleFeaturedWheel}
        {...createSurfaceMotion(reducedMotion, 0)}
      >
        <AnimatePresence initial={false} mode="sync">
          <motion.span
            aria-hidden="true"
            className="featured-backdrop-layer"
            data-featured-id={featured?.id ?? "empty-featured"}
            data-motion-surface="featured-backdrop-layer"
            key={featuredBackdropKey}
            style={featuredArtworkStyle as MotionStyle | undefined}
            {...featuredBackdropMotion}
          />
        </AnimatePresence>
        {featured ? (
          <button
            aria-label={featuredTitle}
            className="featured-hero-button"
            onClick={() => onOpenMedia(featured)}
            ref={featuredButtonRef}
            type="button"
          >
            <AnimatePresence initial={false} mode="wait">
              <motion.span
                className="featured-copy"
                data-featured-id={featured.id}
                key={featuredMotionKey}
                {...featuredCopyMotion}
              >
              <span className="featured-title-wrap">
                {featured.logoUrl ? (
                  <img
                    alt={featuredTitle}
                    className="featured-title-logo"
                    src={featured.logoUrl}
                  />
                ) : null}
                <h2
                  className={featured.logoUrl ? "sr-only" : "featured-title-text"}
                  id="home-featured-title"
                >
                  {featuredTitle}
                </h2>
              </span>
              <span className="featured-meta">{formatMetadata(featured, locale)}</span>
              <span className="featured-description">{featuredDescription}</span>
              </motion.span>
            </AnimatePresence>
          </button>
        ) : (
          <div className="featured-hero-empty">
            <AnimatePresence initial={false} mode="wait">
              <motion.div
                className="featured-copy"
                data-featured-id="empty-featured"
                key={featuredMotionKey}
                {...featuredCopyMotion}
              >
              <span className="workbench-kicker">{translate("home.featured.start")}</span>
              <h2 className="featured-title-text" id="home-featured-title">
                {featuredTitle}
              </h2>
              <p className="featured-description">{featuredDescription}</p>
              <MotionButton className="primary-action" onClick={onOpenSettings} type="button">
                <Server aria-hidden="true" size={15} />
                <span>{translate("home.action.addServer")}</span>
              </MotionButton>
              </motion.div>
            </AnimatePresence>
          </div>
        )}
        {canCycleFeatured ? (
          <div
            aria-label={translate("home.featured.carouselControls")}
            className="featured-carousel-dots"
          >
            {featuredItems.map((item, index) => (
              <motion.button
                aria-label={translate("home.featured.showItem", {
                  title: item.title,
                })}
                animate={{
                  opacity: index === featuredIndex ? 1 : 0.62,
                  width: index === featuredIndex ? 22 : 7,
                }}
                aria-pressed={index === featuredIndex}
                className="featured-carousel-dot"
                key={item.id}
                onClick={() => setSelectedFeaturedId(item.id)}
                transition={
                  reducedMotion
                    ? instantTransition
                    : { duration: 0.22, ease: carouselEase }
                }
                type="button"
              />
            ))}
          </div>
        ) : null}
      </motion.div>

      <MediaRail
        emptyText={translate("home.empty.continueWatching")}
        entry={continueWatching.length > 0}
        items={continueWatching}
        loading={loading}
        onOpenMedia={onOpenMedia}
        showProgress
        title={translate("home.rail.continueWatching")}
      />
      <MediaRail
        cardSize="compact"
        emptyText={
          server
            ? translate("home.empty.noLibraries")
            : translate("home.empty.connectServerFirst")
        }
        entry={continueWatching.length === 0 && libraries.length > 0}
        items={libraries}
        loading={loading}
        onOpenMedia={onOpenLibrary}
        orientation="landscape"
        title={translate("home.rail.mediaLibraries")}
      />
      {latestByLibrary.map(({ items, library }) => (
        <MediaRail
          emptyText={
            server
              ? translate("home.empty.noLatestMedia")
              : translate("home.empty.connectServerFirst")
          }
          entry={false}
          items={items}
          key={library.id}
          loading={loading}
          onOpenMedia={onOpenMedia}
          title={translate("home.rail.latestIn", { title: library.title })}
        />
      ))}
    </section>
  );
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() =>
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }

    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(query.matches);
    updatePreference();
    query.addEventListener?.("change", updatePreference);

    return () => {
      query.removeEventListener?.("change", updatePreference);
    };
  }, []);

  return prefersReducedMotion;
}
