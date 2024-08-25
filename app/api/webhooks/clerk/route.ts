import { clerkClient } from "@clerk/nextjs";
import { WebhookEvent, UserJSON } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Webhook } from "svix";

import { createUser, deleteUser, updateUser } from "@/lib/actions/user.actions";

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    throw new Error("Please add WEBHOOK_SECRET to your environment variables.");
  }

  const { "svix-id": svixId, "svix-timestamp": svixTimestamp, "svix-signature": svixSignature } = headers();

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing svix headers", { status: 400 });
  }

  const payload = await req.json();
  const wh = new Webhook(WEBHOOK_SECRET);

  let event: WebhookEvent;

  try {
    event = wh.verify(JSON.stringify(payload), {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as WebhookEvent;
  } catch (err) {
    console.error("Webhook verification failed:", err);
    return new Response("Webhook verification failed", { status: 400 });
  }

  const { type, data } = event;
  const userData = data as UserJSON; // Casting data to UserJSON type

  if (type === "user.created") {
    const { id, email_addresses, image_url, first_name, last_name, username } = userData;

    const user = await createUser({
      clerkId: id,
      email: email_addresses[0].email_address,
      username: username || email_addresses[0].email_address.split("@")[0],
      firstName: first_name,
      lastName: last_name,
      photo: image_url,
    });

    if (user) {
      await clerkClient.users.updateUserMetadata(id, {
        publicMetadata: { userId: user._id },
      });
    }

    return NextResponse.json({ message: "User created", user });
  }

  if (type === "user.updated") {
    const { id, image_url, first_name, last_name, username } = userData;

    const user = await updateUser(id, {
      firstName: first_name,
      lastName: last_name,
      username: username || email_addresses[0].email_address.split("@")[0], // Reuse email if username is not provided
      photo: image_url,
    });

    return NextResponse.json({ message: "User updated", user });
  }

  if (type === "user.deleted") {
    const { id } = userData;

    const user = await deleteUser(id);
    return NextResponse.json({ message: "User deleted", user });
  }

  return new Response("Event type not handled", { status: 200 });
}
