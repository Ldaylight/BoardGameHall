-- A full-board draw has no winner. Existing match records are preserved.
ALTER TABLE `Match` MODIFY `winnerId` VARCHAR(36) NULL;
