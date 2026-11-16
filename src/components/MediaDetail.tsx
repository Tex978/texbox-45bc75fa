import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Film, Play, Star, Users } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Poster } from "@/components/Shell";
import { getMediaDetail } from "@/lib/nas.functions";
import type { MediaItem } from "@/lib/media";

export function MediaDetail({
  item,
  onClose,
  request,
  requestState,
  canRequest = true,
}: {
  item: MediaItem;
  onClose: () => void;
  request: (item: MediaItem) => void;
  requestState?: string | undefined;
  canRequest?: boolean;
}) {
  const [video, setVideo] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["media-detail", item.type, item.id],
    queryFn: () => getMediaDetail({ data: { id: item.id, type: item.type, tmdbId: item.tmdbId } }),
    staleTime: 600000,
    retry: false,
  });
  const shown = data || item;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="media-dialog" aria-describedby="media-description">
        <div className="media-detail-heading">
          <div className="media-detail-poster">
            <Poster src={shown.poster} title={shown.title} />
          </div>
          <div className="min-w-0">
            <p className="mb-2 text-xs uppercase text-primary">
              {shown.type} · {shown.year || "–"}
            </p>
            <DialogTitle className="media-detail-title">{shown.title}</DialogTitle>
            <DialogDescription id="media-description" className="mt-3">
              {data?.genres.join(" · ") || "Filmadatlap"}
              {data?.runtime ? ` · ${data.runtime} perc` : ""}
            </DialogDescription>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="media-rating">
                <Star size={14} />
                IMDb {shown.imdbRating?.toFixed(1) || "–"}
              </span>
              {shown.imdbId && (
                <Button asChild variant="outline" size="sm">
                  <a
                    href={`https://www.imdb.com/title/${shown.imdbId}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink size={14} />
                    IMDb adatlap
                  </a>
                </Button>
              )}
            </div>
            <Button
              className="mt-4"
              disabled={
                !canRequest ||
                data?.demo ||
                shown.inLibrary ||
                requestState === "busy" ||
                requestState === "done"
              }
              onClick={() => request(shown)}
            >
              {shown.inLibrary
                ? "Már megvan"
                : requestState === "done"
                  ? "Kérve"
                  : requestState === "busy"
                    ? "Kérés…"
                    : "Kérés"}
            </Button>
            {requestState === "error" && (
              <p role="alert" className="mt-2 text-sm text-destructive">
                Nem sikerült a kérés. Újra próbálhatod.
              </p>
            )}
          </div>
        </div>
        {isPending && (
          <p role="status" className="text-sm text-muted-foreground">
            Adatlap betöltése…
          </p>
        )}
        {isError && (
          <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
            Az adatlap nem érhető el.
            <Button variant="outline" onClick={() => void refetch()}>
              Újrapróbálás
            </Button>
          </div>
        )}
        <section className="media-detail-section">
          <h3>
            <Film size={17} />
            Történet
          </h3>
          <p className="text-sm leading-7 text-muted-foreground">
            {shown.overview || "Ehhez a címhez nincs elérhető történetleírás."}
          </p>
        </section>
        {data && (
          <>
            <section className="media-detail-section">
              <h3>
                <Users size={17} />
                Szereplők
              </h3>
              {data.cast.length ? (
                <div className="media-cast">
                  {data.cast.map((actor) => (
                    <div key={actor.name + actor.character} className="min-w-0">
                      {actor.photo ? (
                        <img
                          src={actor.photo}
                          alt={actor.name}
                          loading="lazy"
                          className="aspect-[2/3] w-full rounded-md object-cover bg-secondary"
                        />
                      ) : (
                        <div className="aspect-[2/3] grid place-items-center rounded-md bg-secondary text-muted-foreground">
                          <Users size={28} />
                        </div>
                      )}
                      <p className="mt-2 text-sm font-medium">{actor.name}</p>
                      <p className="text-xs text-muted-foreground">{actor.character}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Szereplőlista nem elérhető.</p>
              )}
            </section>
            <section className="media-detail-section">
              <h3>Képek</h3>
              {data.images.length ? (
                <div className="grid grid-cols-2 gap-3">
                  {data.images.map((src, i) => (
                    <Button
                      key={src}
                      variant="ghost"
                      className="h-auto p-0 overflow-hidden"
                      aria-label={`${shown.title} kép ${i + 1} nagyítása`}
                      onClick={() => setPhoto(photo === src ? null : src)}
                    >
                      <img
                        src={src}
                        alt={`${shown.title} jelenet ${i + 1}`}
                        loading="lazy"
                        className="aspect-video w-full object-cover"
                      />
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Jelenetképek nem elérhetők.</p>
              )}
              {photo && (
                <img
                  src={photo}
                  alt={`${shown.title} nagyított jelenet`}
                  className="mt-4 w-full rounded-md"
                />
              )}
            </section>
            <section className="media-detail-section">
              <h3>
                <Play size={17} />
                Előzetesek
              </h3>
              {data.trailers.length ? (
                <div className="flex flex-wrap gap-3">
                  {data.trailers.map((trailer) => (
                    <Button
                      key={trailer.key}
                      variant={video === trailer.key ? "default" : "outline"}
                      onClick={() => setVideo(trailer.key)}
                      className="h-auto min-h-11 whitespace-normal text-left"
                    >
                      <Play size={16} />
                      {trailer.name}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Előzetes nem elérhető.</p>
              )}
              {video && (
                <>
                  <iframe
                    className="mt-4 aspect-video w-full rounded-md"
                    src={`https://www.youtube-nocookie.com/embed/${video}`}
                    title={`${shown.title} előzetes`}
                    allow="encrypted-media; picture-in-picture; fullscreen"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                  <Button asChild variant="link" className="px-0">
                    <a
                      href={`https://www.youtube.com/watch?v=${video}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Megnyitás YouTube-on
                      <ExternalLink size={14} />
                    </a>
                  </Button>
                </>
              )}
            </section>
            {data.notice && (
              <p className="text-xs leading-5 text-muted-foreground">{data.notice}</p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
