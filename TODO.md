# Future ideas (not started)

- **AI-enabled chess learning** — use an LLM to give adaptive, personalized feedback/hints during puzzles or games (beyond the fixed hint/explanation text), potentially adjusting difficulty based on performance.
- More stages beyond the current 16: deeper endgames (rook endgames, more pawn structures), more tactical motifs (x-ray attacks, overloading), real opening theory, positional play.
- Play vs Computer: option to play as Black, undo/takeback for experimenting, save/resume an in-progress game.
- Spaced repetition: resurface specific puzzles he got wrong (wrong-attempt data already exists transiently in `js/app.js`'s `state`, just isn't persisted/analyzed yet) instead of only moving forward through each stage.
