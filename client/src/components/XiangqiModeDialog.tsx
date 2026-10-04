import { Link } from 'react-router-dom';
import { Swords, Puzzle, ArrowUpRight } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
export function XiangqiModeDialog({
  open,
  onOpenChange,
  onStandard,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStandard: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <span className="eyebrow">CHOOSE YOUR NEXT MOVE</span>
        <DialogTitle className="modal-title">楚河汉界，等你一战</DialogTitle>
        <DialogDescription className="modal-desc">与朋友切磋，或解开一盘经典残局。</DialogDescription>
        <div className="xiangqi-mode-grid">
          <Button
            variant="outline"
            className="xiangqi-mode-card"
            onClick={() => {
              onOpenChange(false);
              onStandard();
            }}
          >
            <Swords size={28} />
            <b>标准对局</b>
            <span>双人实时对弈 · AI 三种难度</span>
            <ArrowUpRight size={18} />
          </Button>
          <Button variant="outline" className="xiangqi-mode-card" asChild>
            <Link to="/xiangqi/endgames" onClick={() => onOpenChange(false)}>
              <Puzzle size={28} />
              <b>经典残局</b>
              <span>重炮 · 马后炮 · 双车错 · 更多</span>
              <ArrowUpRight size={18} />
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
