import { useEffect, useState, useRef, useCallback } from 'react';
import { useNotesStore, Note } from '@/lib/store'; // Assuming Note type is exported from store
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Save, Trash2, Eye, Edit } from 'lucide-react';
import { toast } from 'sonner';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';

// Debounce utility (remains the same)
function debounce<T extends (...args: any[]) => void>(func: T, delay: number) {
  let timeoutId: ReturnType<typeof setTimeout>;
  return function(this: ThisParameterType<T>, ...args: Parameters<T>) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  } as T;
}

export function NoteEditor() {
  const { selectedNote, updateNote, deleteNote, notes } = useNotesStore();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState(''); // HTML content from Quill
  const [isPreview, setIsPreview] = useState(true); // true = Quill read-only
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedTimestamp, setLastSavedTimestamp] = useState(Date.now());
  const [isQuillReady, setIsQuillReady] = useState(false); // New state for Quill readiness

  const quillEditorRef = useRef<HTMLDivElement>(null);
  const quillInstanceRef = useRef<Quill | null>(null);

  const titleRef = useRef(title);
  const contentRef = useRef(content);
  const selectedNoteRef = useRef(selectedNote);
  const prevSelectedNoteIdRef = useRef<string | undefined>();

  useEffect(() => { titleRef.current = title; }, [title]);
  useEffect(() => { contentRef.current = content; }, [content]);
  useEffect(() => { selectedNoteRef.current = selectedNote; }, [selectedNote]);

  // Initialize Quill Editor (runs once after initial render)
  useEffect(() => {
    // Check 1: Is the ref element available?
    if (!quillEditorRef.current) {
      console.error("NoteEditor: Quill Init ABORTED - quillEditorRef.current is null when initialization effect ran. Ensure the div is rendered.");
      return;
    }
    // Check 2: Has Quill already been initialized (e.g., due to fast refresh issues or component re-mounting)?
    if (quillInstanceRef.current) {
      console.warn("NoteEditor: Quill Init SKIPPED - quillInstanceRef.current already exists. This might happen with HMR or if component remounts unexpectedly.");
      // If it already exists and isQuillReady is false, perhaps set it to true.
      // However, this scenario should ideally be avoided by proper component lifecycle.
      // For now, we'll assume if it exists, it was set up correctly.
      // If isQuillReady is false, it implies a previous attempt failed or state is inconsistent.
      if (!isQuillReady) setIsQuillReady(true); // Attempt to recover if instance exists but not marked ready
      return;
    }

    // If we reach here, quillEditorRef.current is valid and quillInstanceRef.current is null.
    console.log("NoteEditor: Attempting to initialize Quill...");
    try {
      const quill = new Quill(quillEditorRef.current, {
        theme: 'snow',
        modules: {
          toolbar: [
            [{ header: [1, 2, 3, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            [{ list: 'ordered' }, { list: 'bullet' }],
            ['link', 'image'],
            ['clean'],
          ],
        },
        placeholder: 'Start writing your note...',
      });

      quill.on(Quill.events.TEXT_CHANGE, (delta, oldDelta, source) => {
        if (source === Quill.sources.USER) {
          const htmlContent = quill.root.innerHTML;
          const isEmptyContent = htmlContent === '<p><br></p>';
          setContent(isEmptyContent ? '' : htmlContent);
        }
      });
      quillInstanceRef.current = quill;
      console.log("NoteEditor: Quill initialized SUCCESSFULLY.");
      setIsQuillReady(true); // Signal that Quill is ready
    } catch (error) {
        console.error("NoteEditor: CRITICAL ERROR during Quill initialization:", error);
        // You might want to set an error state here to inform the user
    }
  }, []); // Empty dependency array ensures this runs only once

  // Effect to manage Quill's enabled state and focus based on isPreview and Quill readiness
  useEffect(() => {
    if (!isQuillReady || !quillInstanceRef.current) {
      console.log("NoteEditor: Enable/Focus effect - Quill not ready yet. isQuillReady:", isQuillReady);
      return;
    }
    const quill = quillInstanceRef.current;
    console.log("NoteEditor: Enable/Focus effect. isPreview:", isPreview, "Setting Quill enabled:", !isPreview);
    quill.enable(!isPreview);
    if (!isPreview) { // If in edit mode
      console.log("NoteEditor: Edit mode active, ensuring Quill focus.");
      setTimeout(() => quill.focus(), 0); // Ensure focus when entering edit mode
    }
  }, [isPreview, isQuillReady]); // Runs when isPreview or isQuillReady changes

  // Effect to load note data into editor when selectedNote changes, IF Quill is ready
  useEffect(() => {
    if (!isQuillReady || !quillInstanceRef.current) {
      if (selectedNote) {
        console.warn(`NoteEditor: Data load deferred - Quill not ready (isQuillReady: ${isQuillReady}) but selectedNote (ID: ${selectedNote.id}) is present.`);
      } else {
        console.log(`NoteEditor: Data load effect - Quill not ready (isQuillReady: ${isQuillReady}), no selected note.`);
      }
      return;
    }

    const quill = quillInstanceRef.current;
    console.log(`NoteEditor: Data load effect RUNNING. isQuillReady: ${isQuillReady}, SelectedNote ID: ${selectedNote?.id}`);

    if (selectedNote) {
      const noteIdChanged = prevSelectedNoteIdRef.current !== selectedNote.id;
      console.log(`NoteEditor: Loading note. ID: ${selectedNote.id}, Title: ${selectedNote.title}, ID changed: ${noteIdChanged}`);
      
      setTitle(selectedNote.title);

      const currentQuillContent = quill.root.innerHTML === '<p><br></p>' ? '' : quill.root.innerHTML;
      if (noteIdChanged || currentQuillContent !== (selectedNote.content || '')) {
        console.log("NoteEditor: Updating Quill content.");
        quill.setContents([]); // Clear editor
        if (selectedNote.content) {
          try {
            quill.clipboard.dangerouslyPasteHTML(0, selectedNote.content);
          } catch (e) {
            console.error("NoteEditor: Error pasting HTML into Quill:", e);
          }
        } else {
          console.log("NoteEditor: Selected note has no content to paste.");
        }
      } else {
        console.log("NoteEditor: Quill content matches selected note, no update needed.");
      }
      setContent(selectedNote.content || '');

      if (noteIdChanged) {
        console.log("NoteEditor: Note ID changed, setting to preview mode.");
        setIsPreview(true); // Default to preview for a newly selected note
      }
      // Focus is handled by the [isPreview, isQuillReady] effect.
      
      setHasUnsavedChanges(false);
      prevSelectedNoteIdRef.current = selectedNote.id;
    } else { // No note selected
      console.log("NoteEditor: No selected note, clearing editor (Quill is ready).");
      setTitle('');
      quill.setContents([]); 
      setContent('');
      setIsPreview(false); // Default to edit mode for a new (unsaved) note
      setHasUnsavedChanges(false);
      prevSelectedNoteIdRef.current = undefined;
    }
  }, [selectedNote, isQuillReady]); // Depends on selectedNote and Quill readiness

  const stableExecuteSave = useCallback(async (
    noteId: string,
    titleToSave: string,
    contentToSave: string,
    originalNote: Note | null | undefined
  ) => {
    if (!originalNote || (titleToSave === originalNote.title && contentToSave === originalNote.content)) {
      setHasUnsavedChanges(false);
      return true;
    }
    try {
      await updateNote(noteId, { title: titleToSave, content: contentToSave });
      setLastSavedTimestamp(Date.now());
      toast.success('Note saved successfully');
      setHasUnsavedChanges(false);
      return true;
    } catch (error) {
      toast.error('Failed to save note');
      console.error('Save error:', error);
      return false;
    }
  }, [updateNote]);

  const debouncedAutoSave = useCallback(
    debounce(async () => {
      const currentSelectedNote = selectedNoteRef.current;
      if (currentSelectedNote) {
        await stableExecuteSave(
          currentSelectedNote.id,
          titleRef.current,
          contentRef.current,
          currentSelectedNote
        );
      }
    }, 1500),
    [stableExecuteSave]
  );

  useEffect(() => {
    const currentPersistedNote = selectedNoteRef.current;
    if (currentPersistedNote) {
      const titleChanged = title !== currentPersistedNote.title;
      const contentChanged = content !== currentPersistedNote.content;
      const changed = titleChanged || contentChanged;
      setHasUnsavedChanges(changed);
      if (changed) {
        debouncedAutoSave();
      }
    } else {
      const changed = title !== '' || content !== '';
      setHasUnsavedChanges(changed);
    }
  }, [title, content, debouncedAutoSave]);

  const handleManualSave = useCallback(async () => {
    const currentSelectedNote = selectedNoteRef.current;
    if (currentSelectedNote) {
      await stableExecuteSave(
        currentSelectedNote.id,
        titleRef.current, 
        contentRef.current, 
        currentSelectedNote
      );
    } else {
      toast.info("No note selected to save. Create a new note first.");
    }
  }, [stableExecuteSave]);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        handleManualSave();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleManualSave]);

  const handleDelete = async () => {
    if (!selectedNoteRef.current) return;
    try {
      await deleteNote(selectedNoteRef.current.id);
      toast.success('Note deleted successfully');
    } catch (error) {
      toast.error('Failed to delete note');
      console.error('Delete error:', error);
    }
  };

  const handleTogglePreview = () => {
    const quill = quillInstanceRef.current;
    if (!isQuillReady || !quill) { // Check isQuillReady
        console.warn("NoteEditor: Toggle preview - Quill not ready.");
        return;
    }
    if (!isPreview && hasUnsavedChanges) {
      handleManualSave(); 
    }
    setIsPreview(prev => {
      const newIsPreview = !prev;
      console.log("NoteEditor: Toggling preview via button. New isPreview:", newIsPreview);
      return newIsPreview;
    });
  };

  const handlePreviewAreaClick = useCallback(() => {
    if (isPreview) {
      console.log("NoteEditor: Preview area clicked, switching to edit mode.");
      setIsPreview(false);
    }
  }, [isPreview]);

  // Conditional Rendering for Empty States (remains the same)
  if (!selectedNote && notes.length === 0) {
    return (
      <div className="flex-1 p-6 flex flex-col items-center justify-center text-center text-muted-foreground">
        <h2 className="text-xl font-semibold mb-2">No Notes Yet</h2>
        <p className="mb-4">Click the "New Note" button in the sidebar to get started.</p>
      </div>
    );
  }

  if (!selectedNote) {
    return (
      <div className="flex-1 p-6 flex flex-col items-center justify-center text-center text-muted-foreground">
        <h2 className="text-xl font-semibold mb-2">Select a Note</h2>
        <p>Choose a note from the list to view or edit it, or create a new one.</p>
      </div>
    );
  }

  // Main Editor JSX (remains the same structurally)
  return (
    <div className="flex-1 p-4 md:p-6 flex flex-col gap-4 h-screen max-h-screen overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 md:gap-4 flex-shrink-0">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Note Title"
          className="text-xl md:text-2xl font-semibold border-0 shadow-none focus-visible:ring-0 p-0 h-auto flex-grow bg-transparent"
          aria-label="Note Title"
          disabled={isPreview}
        />
        <Button
          variant="destructive"
          size="sm"
          onClick={handleDelete}
          title="Delete Note"
          className="gap-1 h-8 text-xs md:text-sm"
          aria-label="Delete Note"
        >
          <Trash2 className="h-3.5 w-3.5 md:h-4 md:w-4" />
          Delete
        </Button>
      </div>

      {/* Action Toolbar */}
      <div className="flex items-center justify-end sticky top-0 bg-background py-2 z-10 border-b mb-2 flex-shrink-0 gap-2">
        <Button
          onClick={handleManualSave}
          variant="secondary"
          size="sm"
          className="gap-1 h-8 text-xs md:text-sm"
          aria-label="Save Note"
          title="Save (Ctrl+S)"
          disabled={!hasUnsavedChanges && !selectedNoteRef.current}
        >
          <Save className="h-3.5 w-3.5 md:h-4 md:w-4" />
          Save
          {hasUnsavedChanges && <span className="ml-1 text-xs opacity-70">(unsaved)</span>}
        </Button>
        <Button
          onClick={handleTogglePreview}
          variant="outline"
          size="sm"
          className="gap-1 h-8 text-xs md:text-sm"
          aria-label={isPreview ? "Switch to Edit Mode" : "Switch to Preview Mode"}
          title={isPreview ? "Switch to Edit Mode" : "Switch to Preview Mode"}
        >
          {isPreview ? (
            <> <Edit className="h-3.5 w-3.5 md:h-4 md:w-4" /> Edit </>
          ) : (
            <> <Eye className="h-3.5 w-3.5 md:h-4 md:w-4" /> Preview </>
          )}
        </Button>
      </div>

      {/* Quill Editor Area */}
      <div
        className="flex-grow min-h-0 flex flex-col quill-editor-wrapper"
        onClick={handlePreviewAreaClick}
        role={isPreview ? "button" : undefined}
        tabIndex={isPreview ? 0 : undefined}
        onKeyDown={isPreview ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handlePreviewAreaClick(); } } : undefined}
      >
        <div ref={quillEditorRef} className="h-full quill-editor-container flex flex-col" />
      </div>
    </div>
  );
}