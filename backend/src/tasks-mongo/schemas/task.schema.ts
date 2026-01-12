import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

@Schema({ timestamps: true, collection: "tasks" })
export class TaskDocument extends Document {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ default: false })
  completed: boolean;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;
}

export const TaskSchema = SchemaFactory.createForClass(TaskDocument);
