import { Inject, Injectable } from "@nestjs/common";

import { OrganizerProfiles } from "../../users/application/public-api.js";
import { EventNotFoundError } from "./errors.js";
import {
  CHECKIN_REPOSITORY,
  type CheckinRepository,
  type CheckinStats,
} from "./ports/checkin-repository.js";

/** How many reads the door's screen lists. */
export const LAST_SCANS = 5;

/** The count at the door of one of the organizer's events, and its latest reads. */
@Injectable()
export class GetCheckinStats {
  constructor(
    @Inject(CHECKIN_REPOSITORY) private readonly checkins: CheckinRepository,
    private readonly profiles: OrganizerProfiles,
  ) {}

  /** @throws EventNotFoundError when the event is not the caller's. */
  async execute(caller: { readonly id: string }, eventId: string): Promise<CheckinStats> {
    const organizerId = await this.profiles.profileIdOf(caller.id);
    const door = organizerId ? await this.checkins.findDoor(eventId, organizerId) : null;
    if (!door) throw new EventNotFoundError();
    return this.checkins.stats(door.eventId, LAST_SCANS);
  }
}
